#!/usr/bin/env python3

import json
import logging
from logging.handlers import RotatingFileHandler
import sqlite3
import threading
import time
import uuid
from datetime import datetime
from flask import Flask, request, jsonify, render_template, send_from_directory, send_file
from contextlib import contextmanager
from werkzeug.utils import secure_filename
import os
import pytz
import requests
from PIL import Image, ImageOps
import io

# Configuration
CONFIG = {
    'host': '0.0.0.0',  # Listen on all interfaces
    'port': 8080,
    'database': 'humidity.db',
    'log_file': 'humidity_server.log',
    'log_level': logging.INFO,
    'cleanup_days': 30,  # Keep sensor data for 30 days (memories are kept forever)
    'timezone': 'Asia/Jerusalem',  # Israel timezone
    'upload_folder': 'uploads/photos',  # Photo storage directory
    'max_file_size': 10 * 1024 * 1024,  # 10MB max file size
    'allowed_extensions': {'png', 'jpg', 'jpeg', 'gif', 'webp'}
}


# Setup logging with rotation
log_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
rotating_handler = RotatingFileHandler(
    CONFIG['log_file'], maxBytes=1_000_000, backupCount=3
)
rotating_handler.setFormatter(log_formatter)
rotating_handler.setLevel(CONFIG['log_level'])

stream_handler = logging.StreamHandler()
stream_handler.setFormatter(log_formatter)
stream_handler.setLevel(CONFIG['log_level'])

logger = logging.getLogger(__name__)
logger.setLevel(CONFIG['log_level'])
logger.handlers.clear()
logger.addHandler(rotating_handler)
logger.addHandler(stream_handler)

# Flask app
app = Flask(__name__, 
            static_folder='web_ui/static',
            template_folder='web_ui/templates')

# Configure upload settings
app.config['MAX_CONTENT_LENGTH'] = CONFIG['max_file_size']

# Ensure upload directory exists
os.makedirs(CONFIG['upload_folder'], exist_ok=True)

# Add request logging middleware
@app.before_request
def log_request_info():
    """Log detailed request information"""
    logger.info(f"Request: {request.method} {request.path} from {request.remote_addr}")
    if request.content_length:
        logger.info(f"Content-Length: {request.content_length} bytes")
        # Check if content length exceeds max file size
        if request.content_length > CONFIG['max_file_size']:
            logger.warning(f"Request content length ({request.content_length}) exceeds max file size ({CONFIG['max_file_size']})")
    if request.content_type:
        logger.info(f"Content-Type: {request.content_type}")

@app.errorhandler(413)
def handle_file_too_large(error):
    """Handle file too large error"""
    logger.error(f"File too large error: {error}")
    return jsonify({'error': f'File too large. Maximum size is {CONFIG["max_file_size"] // (1024*1024)}MB'}), 413

@app.after_request
def log_response_info(response):
    """Log response information"""
    logger.info(f"Response: {response.status_code} for {request.method} {request.path}")
    return response


def allowed_file(filename):
    """Check if uploaded file has allowed extension"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in CONFIG['allowed_extensions']


def resize_image(image_data, max_width=1920, max_height=1080, quality=85, rotation=None):
    """Resize, rotate and optimize image while maintaining aspect ratio
    
    Args:
        image_data: Raw image bytes
        max_width: Maximum width in pixels
        max_height: Maximum height in pixels
        quality: JPEG quality (1-100)
        rotation: Manual rotation in degrees (0, 90, 180, 270) or None for auto-rotation only
    """
    try:
        logger.info(f"Starting image processing - Input size: {len(image_data)} bytes, Max dimensions: {max_width}x{max_height}, Quality: {quality}, Rotation: {rotation}")
        
        # Open image from bytes
        logger.info("Opening image from bytes")
        img = Image.open(io.BytesIO(image_data))
        logger.info(f"Image opened successfully - Mode: {img.mode}, Size: {img.size}")
        
        # Apply automatic EXIF orientation correction first
        logger.info("Applying EXIF orientation correction")
        img = ImageOps.exif_transpose(img)
        logger.info(f"EXIF orientation applied - New size: {img.size}")
        
        # Apply manual rotation if specified
        if rotation is not None:
            if rotation in [90, 180, 270]:
                logger.info(f"Applying manual rotation: {rotation} degrees")
                img = img.rotate(-rotation, expand=True)  # Negative because PIL rotates counter-clockwise
                logger.info(f"Manual rotation applied - New size: {img.size}")
            elif rotation != 0:
                logger.warning(f"Invalid rotation value {rotation}, skipping manual rotation")
        
        # Convert to RGB if necessary (handles RGBA, P mode images)
        if img.mode in ('RGBA', 'P'):
            logger.info(f"Converting image from {img.mode} to RGB")
            img = img.convert('RGB')
            logger.info("Image conversion completed")
        
        # Calculate new size maintaining aspect ratio
        original_width, original_height = img.size
        logger.info(f"Final dimensions before resize: {original_width}x{original_height}")
        
        # Only resize if image is larger than max dimensions
        if original_width > max_width or original_height > max_height:
            ratio = min(max_width / original_width, max_height / original_height)
            new_width = int(original_width * ratio)
            new_height = int(original_height * ratio)
            
            logger.info(f"Resizing image - Ratio: {ratio:.3f}, New dimensions: {new_width}x{new_height}")
            
            # Use LANCZOS for high quality resizing
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            logger.info("Image resize completed")
        else:
            logger.info("Image size within limits, no resize needed")
        
        # Save optimized image to bytes
        logger.info("Starting image compression and save")
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=quality, optimize=True)
        output.seek(0)
        
        result_data = output.getvalue()
        logger.info(f"Image processing completed - Output size: {len(result_data)} bytes (reduction: {((len(image_data) - len(result_data)) / len(image_data) * 100):.1f}%)")
        
        return result_data
    except Exception as e:
        logger.error(f"Error processing image: {e}", exc_info=True)
        logger.info("Returning original image data due to processing failure")
        return image_data  # Return original if processing fails


def generate_photo_filename(original_filename):
    """Generate unique filename for uploaded photo"""
    ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else 'jpg'
    unique_id = str(uuid.uuid4())
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    return f"{timestamp}_{unique_id}.{ext}"


# Timezone configuration
ISRAEL_TZ = pytz.timezone(CONFIG['timezone'])


def get_israel_time():
    """Get current time in Israel timezone"""
    return datetime.now(ISRAEL_TZ)


def get_israel_timestamp():
    """Get current timestamp string in Israel timezone"""
    return get_israel_time().isoformat()


def send_message_to_bot(chat_id, sender, message):
    """Send message to Telegram bot"""
    url = "http://127.0.0.1:5000/webhook"  # The webhook URL
    message_data = {
        "message": {
            "chat": {"id": chat_id},
            "from": {"username": sender, "first_name": sender},
            "text": 'Garden listener alert. Pass it to the family by using the RESPOND action:\n'+message
        }
    }
    # Send the message to the bot
    try:
        response = requests.post(url, json=message_data, timeout=10)
        if response.status_code == 200:
            logger.info("Telegram notification sent successfully!")
            return True
        else:
            logger.error(f"Failed to send Telegram notification. Status code: {response.status_code}, Response: {response.text}")
            return False
    except Exception as e:
        logger.error(f"Error sending Telegram notification: {e}")
        return False


class HumidityDatabase:
    def __init__(self, db_path):
        self.db_path = db_path
        self.init_database()

    def init_database(self):
        """Initialize the database with required tables"""
        # Only create directories if the path has a directory component
        if os.path.dirname(self.db_path):
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

        with self.get_connection() as conn:
            # Check if we need to migrate existing table
            cursor = conn.execute("PRAGMA table_info(humidity_readings)")
            columns = [row[1] for row in cursor.fetchall()]
            
            # Create the updated table with sensor information
            if 'sensor_id' not in columns:
                # Create new table with sensor support
                conn.execute('''
                             CREATE TABLE IF NOT EXISTS humidity_readings_new
                             (
                                 id
                                 INTEGER
                                 PRIMARY
                                 KEY
                                 AUTOINCREMENT,
                                 device_id
                                 TEXT
                                 NOT
                                 NULL,
                                 sensor_id
                                 TEXT,
                                 sensor_pin
                                 INTEGER,
                                 raw_value
                                 INTEGER
                                 NOT
                                 NULL,
                                 humidity_percent
                                 REAL
                                 NOT
                                 NULL,
                                 esp32_timestamp
                                 INTEGER,
                                 server_timestamp
                                 TEXT
                                 NOT
                                 NULL,
                                 created_at
                                 TIMESTAMP
                                 DEFAULT
                                 CURRENT_TIMESTAMP
                             )
                             ''')
                
                # Migrate existing data if old table exists
                cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='humidity_readings'")
                if cursor.fetchone():
                    conn.execute('''
                        INSERT INTO humidity_readings_new 
                        (device_id, raw_value, humidity_percent, esp32_timestamp, server_timestamp, created_at)
                        SELECT device_id, raw_value, humidity_percent, esp32_timestamp, server_timestamp, created_at
                        FROM humidity_readings
                    ''')
                    conn.execute('DROP TABLE humidity_readings')
                
                conn.execute('ALTER TABLE humidity_readings_new RENAME TO humidity_readings')
            else:
                # Table already has sensor columns, just ensure it exists
                conn.execute('''
                             CREATE TABLE IF NOT EXISTS humidity_readings
                             (
                                 id
                                 INTEGER
                                 PRIMARY
                                 KEY
                                 AUTOINCREMENT,
                                 device_id
                                 TEXT
                                 NOT
                                 NULL,
                                 sensor_id
                                 TEXT,
                                 sensor_pin
                                 INTEGER,
                                 raw_value
                                 INTEGER
                                 NOT
                                 NULL,
                                 humidity_percent
                                 REAL
                                 NOT
                                 NULL,
                                 esp32_timestamp
                                 INTEGER,
                                 server_timestamp
                                 TEXT
                                 NOT
                                 NULL,
                                 created_at
                                 TIMESTAMP
                                 DEFAULT
                                 CURRENT_TIMESTAMP
                             )
                             ''')
            
            # Create sensor configuration table for thresholds and alert states
            conn.execute('''
                         CREATE TABLE IF NOT EXISTS sensor_config
                         (
                             device_id TEXT NOT NULL,
                             sensor_id TEXT NOT NULL,
                             display_name TEXT,
                             humidity_threshold REAL,
                             alerts_enabled INTEGER DEFAULT 1,
                             created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                             updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                             PRIMARY KEY (device_id, sensor_id)
                         )
                         ''')
            
            # Create global settings table
            conn.execute('''
                         CREATE TABLE IF NOT EXISTS global_settings
                         (
                             key TEXT PRIMARY KEY,
                             value TEXT,
                             updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                         )
                         ''')
            
            # Insert default global threshold if not exists
            conn.execute('''
                         INSERT OR IGNORE INTO global_settings (key, value)
                         VALUES ('global_humidity_threshold', '30.0')
                         ''')
            
            # Create memories table with photo support
            conn.execute('''
                         CREATE TABLE IF NOT EXISTS memories
                         (
                             id INTEGER PRIMARY KEY AUTOINCREMENT,
                             user_name TEXT NOT NULL,
                             memory_text TEXT NOT NULL,
                             photo_filename TEXT,
                             created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                         )
                         ''')
            
            # Check if we need to add photo_filename column to existing table
            cursor = conn.execute("PRAGMA table_info(memories)")
            columns = [row[1] for row in cursor.fetchall()]
            if 'photo_filename' not in columns:
                conn.execute('ALTER TABLE memories ADD COLUMN photo_filename TEXT')
                logger.info("Added photo_filename column to memories table")
            
            # Create indexes
            conn.execute('''
                         CREATE INDEX IF NOT EXISTS idx_device_timestamp
                             ON humidity_readings(device_id, created_at)
                         ''')
            conn.execute('''
                         CREATE INDEX IF NOT EXISTS idx_sensor_timestamp
                             ON humidity_readings(sensor_id, created_at)
                         ''')
            conn.execute('''
                         CREATE INDEX IF NOT EXISTS idx_device_sensor_timestamp
                             ON humidity_readings(device_id, sensor_id, created_at)
                         ''')
            conn.commit()

    @contextmanager
    def get_connection(self):
        """Context manager for database connections"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def insert_reading(self, device_id, raw_value, humidity_percent, esp32_timestamp, sensor_id=None, sensor_pin=None):
        """Insert a new humidity reading with optional sensor information"""
        server_timestamp = get_israel_timestamp()

        with self.get_connection() as conn:
            conn.execute('''
                         INSERT INTO humidity_readings
                         (device_id, sensor_id, sensor_pin, raw_value, humidity_percent, esp32_timestamp, server_timestamp)
                         VALUES (?, ?, ?, ?, ?, ?, ?)
                         ''', (device_id, sensor_id, sensor_pin, raw_value, humidity_percent, esp32_timestamp, server_timestamp))
            conn.commit()
            
        # Check for threshold alerts after inserting the reading
        if sensor_id:
            self.check_humidity_threshold(device_id, sensor_id, humidity_percent)

    def check_humidity_threshold(self, device_id, sensor_id, humidity_percent):
        """Check if humidity is below threshold and send alert if needed"""
        try:
            with self.get_connection() as conn:
                # Get sensor config
                cursor = conn.execute('''
                    SELECT humidity_threshold, alerts_enabled, display_name
                    FROM sensor_config 
                    WHERE device_id = ? AND sensor_id = ?
                ''', (device_id, sensor_id))
                
                sensor_config = cursor.fetchone()
                
                # If no sensor-specific threshold, use global threshold
                threshold = None
                alerts_enabled = True
                display_name = sensor_id
                
                if sensor_config:
                    threshold = sensor_config['humidity_threshold']
                    alerts_enabled = bool(sensor_config['alerts_enabled'])
                    display_name = sensor_config['display_name'] or sensor_id
                
                # Get global threshold if no sensor-specific threshold
                if threshold is None:
                    cursor = conn.execute('''
                        SELECT value FROM global_settings WHERE key = 'global_humidity_threshold'
                    ''')
                    global_threshold = cursor.fetchone()
                    if global_threshold:
                        threshold = float(global_threshold['value'])
                
                # Check if alert should be sent
                if threshold and alerts_enabled and humidity_percent < threshold:
                    # Send telegram notification
                    message = f"The {display_name} humidity is below {threshold}% (current: {humidity_percent:.1f}%)"
                    success = send_message_to_bot(-1002340388184, "Listener: garden", message)
                    
                    if success:
                        # Disable alerts for this sensor until manually re-enabled
                        self.set_sensor_alerts_enabled(device_id, sensor_id, False)
                        logger.info(f"Alert sent for {device_id}:{sensor_id}, alerts disabled")
                
        except Exception as e:
            logger.error(f"Error checking humidity threshold: {e}")

    def get_sensor_config(self, device_id, sensor_id):
        """Get configuration for a specific sensor"""
        with self.get_connection() as conn:
            cursor = conn.execute('''
                SELECT * FROM sensor_config 
                WHERE device_id = ? AND sensor_id = ?
            ''', (device_id, sensor_id))
            return dict(cursor.fetchone()) if cursor.fetchone() else None

    def update_sensor_config(self, device_id, sensor_id, display_name=None, humidity_threshold=None, alerts_enabled=None):
        """Update sensor configuration"""
        with self.get_connection() as conn:
            # Insert or update sensor config
            if alerts_enabled is None:
                # Preserve existing alerts_enabled value
                conn.execute('''
                    INSERT OR REPLACE INTO sensor_config 
                    (device_id, sensor_id, display_name, humidity_threshold, alerts_enabled, updated_at)
                    VALUES (?, ?, ?, ?, 
                            COALESCE((SELECT alerts_enabled FROM sensor_config WHERE device_id = ? AND sensor_id = ?), 1),
                            datetime('now'))
                ''', (device_id, sensor_id, display_name, humidity_threshold, device_id, sensor_id))
            else:
                # Use provided alerts_enabled value
                conn.execute('''
                    INSERT OR REPLACE INTO sensor_config 
                    (device_id, sensor_id, display_name, humidity_threshold, alerts_enabled, updated_at)
                    VALUES (?, ?, ?, ?, ?, datetime('now'))
                ''', (device_id, sensor_id, display_name, humidity_threshold, int(alerts_enabled)))
            conn.commit()

    def set_sensor_alerts_enabled(self, device_id, sensor_id, enabled):
        """Enable or disable alerts for a specific sensor"""
        with self.get_connection() as conn:
            conn.execute('''
                INSERT OR REPLACE INTO sensor_config 
                (device_id, sensor_id, display_name, humidity_threshold, alerts_enabled, updated_at)
                VALUES (?, ?, 
                        COALESCE((SELECT display_name FROM sensor_config WHERE device_id = ? AND sensor_id = ?), ?),
                        COALESCE((SELECT humidity_threshold FROM sensor_config WHERE device_id = ? AND sensor_id = ?), NULL),
                        ?, datetime('now'))
            ''', (device_id, sensor_id, device_id, sensor_id, sensor_id, device_id, sensor_id, int(enabled)))
            conn.commit()

    def get_all_sensor_configs(self):
        """Get all sensor configurations"""
        with self.get_connection() as conn:
            cursor = conn.execute('''
                SELECT device_id, sensor_id, display_name, humidity_threshold, alerts_enabled
                FROM sensor_config
                ORDER BY device_id, sensor_id
            ''')
            return [dict(row) for row in cursor.fetchall()]

    def get_global_threshold(self):
        """Get global humidity threshold"""
        with self.get_connection() as conn:
            cursor = conn.execute('''
                SELECT value FROM global_settings WHERE key = 'global_humidity_threshold'
            ''')
            result = cursor.fetchone()
            return float(result['value']) if result else 30.0

    def set_global_threshold(self, threshold):
        """Set global humidity threshold"""
        with self.get_connection() as conn:
            conn.execute('''
                INSERT OR REPLACE INTO global_settings (key, value, updated_at)
                VALUES ('global_humidity_threshold', ?, datetime('now'))
            ''', (str(threshold),))
            conn.commit()

    def get_latest_readings(self, device_id=None, sensor_id=None, limit=100):
        """Get latest readings, optionally filtered by device and/or sensor"""
        query = '''
                SELECT id, device_id, sensor_id, sensor_pin, raw_value, humidity_percent, esp32_timestamp, 
                       server_timestamp, server_timestamp as created_at
                FROM humidity_readings
                WHERE (? IS NULL OR device_id = ?)
                AND (? IS NULL OR sensor_id = ?)
                ORDER BY created_at DESC LIMIT ?
                '''

        with self.get_connection() as conn:
            cursor = conn.execute(query, (device_id, device_id, sensor_id, sensor_id, limit))
            return [dict(row) for row in cursor.fetchall()]

    def get_readings_since(self, hours=24, device_id=None, sensor_id=None):
        """Get readings from the last N hours"""
        query = '''
            SELECT id, device_id, sensor_id, sensor_pin, raw_value, humidity_percent, esp32_timestamp, 
                   server_timestamp, server_timestamp as created_at
            FROM humidity_readings 
            WHERE (? IS NULL OR device_id = ?)
            AND (? IS NULL OR sensor_id = ?)
            AND created_at > datetime('now', '-{} hours')
            ORDER BY created_at DESC
        '''.format(hours)

        with self.get_connection() as conn:
            cursor = conn.execute(query, (device_id, device_id, sensor_id, sensor_id))
            return [dict(row) for row in cursor.fetchall()]

    def get_sampled_readings_since(self, hours=24, device_id=None, sensor_id=None, sample_size=360):
        """Get sampled readings from the last N hours to limit data points for performance"""
        # Calculate sampling interval based on expected data points
        # Assuming 1 reading every 10 seconds: hours * 3600 / 10 = total readings
        total_expected_readings = hours * 360  # 360 readings per hour
        
        if total_expected_readings <= sample_size:
            # No need to sample, return all data
            return self.get_readings_since(hours, device_id, sensor_id)
        
        # First, get the number of unique sensors to understand data distribution
        sensor_count_query = '''
            SELECT COUNT(DISTINCT sensor_id) as sensor_count
            FROM humidity_readings 
            WHERE (? IS NULL OR device_id = ?)
            AND (? IS NULL OR sensor_id = ?)
            AND created_at > datetime('now', '-{} hours')
        '''.format(hours)
        
        with self.get_connection() as conn:
            cursor = conn.execute(sensor_count_query, (device_id, device_id, sensor_id, sensor_id))
            sensor_count = cursor.fetchone()[0] or 1
        
        # Calculate time buckets to ensure we cover the full time range
        # We want to distribute sample_size points across the time range, with each sensor
        # getting representation in each time bucket
        time_buckets = max(sample_size // max(sensor_count, 1), 10)  # At least 10 time buckets
        sampling_interval_seconds = max(1, (hours * 3600) // time_buckets)
        
        # Use time-based sampling to ensure all sensors are represented fairly across the full time range
        query = '''
            WITH time_buckets AS (
                SELECT 
                    id, device_id, sensor_id, sensor_pin, raw_value, humidity_percent,
                    esp32_timestamp, server_timestamp, server_timestamp as created_at,
                    CAST((julianday('now') - julianday(created_at)) * 24 * 3600 / ? AS INTEGER) as time_bucket,
                    ROW_NUMBER() OVER (
                        PARTITION BY 
                            CAST((julianday('now') - julianday(created_at)) * 24 * 3600 / ? AS INTEGER),
                            device_id, 
                            sensor_id 
                        ORDER BY created_at DESC
                    ) as rn_in_bucket
                FROM humidity_readings 
                WHERE (? IS NULL OR device_id = ?)
                AND (? IS NULL OR sensor_id = ?)
                AND created_at > datetime('now', '-{} hours')
            )
            SELECT id, device_id, sensor_id, sensor_pin, raw_value, humidity_percent,
                   esp32_timestamp, server_timestamp, created_at
            FROM time_buckets 
            WHERE rn_in_bucket = 1  -- Take the most recent reading from each sensor in each time bucket
            ORDER BY created_at DESC
            LIMIT ?
        '''.format(hours)

        with self.get_connection() as conn:
            cursor = conn.execute(query, (
                sampling_interval_seconds, sampling_interval_seconds, 
                device_id, device_id, sensor_id, sensor_id, 
                sample_size * 2  # Allow more readings to ensure we get good coverage
            ))
            readings = [dict(row) for row in cursor.fetchall()]
            
            # If we have too many readings, do final sampling while preserving time distribution
            if len(readings) > sample_size:
                # Keep readings distributed across time - take every nth reading
                step = len(readings) // sample_size
                readings = readings[::max(1, step)][:sample_size]
                
            return readings

    def cleanup_old_data(self, days=30):
        """Remove old sensor data while preserving memories forever"""
        with self.get_connection() as conn:
            # Only clean up humidity readings, never touch memories
            cursor = conn.execute('''
                DELETE FROM humidity_readings 
                WHERE created_at < datetime('now', '-{} days')
            '''.format(days))
            deleted_count = cursor.rowcount
            conn.commit()
            return deleted_count

    def add_memory(self, user_name, memory_text, photo_filename=None):
        """Add a new memory entry with optional photo"""
        logger.info(f"Database add_memory called - User: {user_name}, Photo: {photo_filename}, Text length: {len(memory_text)}")
        
        with self.get_connection() as conn:
            logger.info("Database connection established for memory insertion")
            cursor = conn.execute('''
                INSERT INTO memories (user_name, memory_text, photo_filename)
                VALUES (?, ?, ?)
            ''', (user_name, memory_text, photo_filename))
            memory_id = cursor.lastrowid
            logger.info(f"Memory inserted with ID: {memory_id}, committing transaction")
            conn.commit()
            logger.info("Database transaction committed successfully")
            return memory_id

    def get_latest_memory(self):
        """Get the most recent memory"""
        with self.get_connection() as conn:
            cursor = conn.execute('''
                SELECT id, user_name, memory_text, photo_filename, created_at
                FROM memories
                ORDER BY created_at DESC
                LIMIT 1
            ''')
            result = cursor.fetchone()
            return dict(result) if result else None

    def get_memory_by_id(self, memory_id):
        """Get a specific memory by ID"""
        with self.get_connection() as conn:
            cursor = conn.execute('''
                SELECT id, user_name, memory_text, photo_filename, created_at
                FROM memories
                WHERE id = ?
            ''', (memory_id,))
            result = cursor.fetchone()
            return dict(result) if result else None

    def get_all_memories(self, limit=50):
        """Get all memories with optional limit"""
        with self.get_connection() as conn:
            cursor = conn.execute('''
                SELECT id, user_name, memory_text, photo_filename, created_at
                FROM memories
                ORDER BY created_at DESC
                LIMIT ?
            ''', (limit,))
            return [dict(row) for row in cursor.fetchall()]

    def get_memory_stats(self):
        """Get memory statistics"""
        with self.get_connection() as conn:
            cursor = conn.execute('''
                SELECT 
                    COUNT(*) as total_memories,
                    COUNT(DISTINCT user_name) as unique_users,
                    MIN(created_at) as oldest_memory,
                    MAX(created_at) as newest_memory
                FROM memories
            ''')
            result = cursor.fetchone()
            return dict(result) if result else {
                'total_memories': 0,
                'unique_users': 0,
                'oldest_memory': None,
                'newest_memory': None
            }

    def delete_memory(self, memory_id):
        """Delete a memory and its associated photo"""
        with self.get_connection() as conn:
            # Get the photo filename before deleting
            cursor = conn.execute('''
                SELECT photo_filename FROM memories WHERE id = ?
            ''', (memory_id,))
            result = cursor.fetchone()
            
            if not result:
                return False, "Memory not found"
            
            photo_filename = result['photo_filename']
            
            # Delete the memory from database
            cursor = conn.execute('''
                DELETE FROM memories WHERE id = ?
            ''', (memory_id,))
            
            if cursor.rowcount == 0:
                return False, "Memory not found"
            
            conn.commit()
            
            # Delete the photo file if it exists
            if photo_filename:
                try:
                    photo_path = os.path.join(CONFIG['upload_folder'], photo_filename)
                    if os.path.exists(photo_path):
                        os.remove(photo_path)
                        logger.info(f"Deleted photo file: {photo_filename}")
                except Exception as e:
                    logger.error(f"Error deleting photo file {photo_filename}: {e}")
                    # Don't fail the operation if photo deletion fails
            
            return True, "Memory deleted successfully"


# Initialize database
db = HumidityDatabase(CONFIG['database'])


@app.route('/humidity', methods=['POST'])
def receive_humidity_data():
    """Endpoint to receive humidity data from ESP32"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        # Validate required fields
        required_fields = ['device_id', 'raw_value', 'humidity_percent']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # Extract sensor information (optional for backward compatibility)
        sensor_id = data.get('sensor_id')
        sensor_pin = data.get('sensor_pin')

        # Insert into database
        db.insert_reading(
            device_id=data['device_id'],
            raw_value=data['raw_value'],
            humidity_percent=data['humidity_percent'],
            esp32_timestamp=data.get('timestamp'),
            sensor_id=sensor_id,
            sensor_pin=sensor_pin
        )

        # Enhanced logging with sensor information
        sensor_info = f" ({sensor_id} on pin {sensor_pin})" if sensor_id else ""
        logger.info(f"Received data from {data['device_id']}{sensor_info}: "
                    f"Raw={data['raw_value']}, Humidity={data['humidity_percent']}%")

        return jsonify({'status': 'success', 'message': 'Data received'}), 200

    except Exception as e:
        logger.error(f"Error processing humidity data: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/humidity/latest', methods=['GET'])
def get_latest_humidity():
    """Get latest humidity readings"""
    device_id = request.args.get('device_id')
    sensor_id = request.args.get('sensor_id')
    limit = int(request.args.get('limit', 100))

    try:
        readings = db.get_latest_readings(device_id=device_id, sensor_id=sensor_id, limit=limit)
        return jsonify({
            'status': 'success',
            'count': len(readings),
            'readings': readings
        })
    except Exception as e:
        logger.error(f"Error retrieving latest readings: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/humidity/history', methods=['GET'])
def get_humidity_history():
    """Get humidity readings from the last N hours with optional sampling"""
    device_id = request.args.get('device_id')
    sensor_id = request.args.get('sensor_id')
    hours = int(request.args.get('hours', 24))
    sample_size = request.args.get('sample_size')

    try:
        if sample_size:
            # Use sampled data for better performance
            readings = db.get_sampled_readings_since(
                hours=hours, 
                device_id=device_id, 
                sensor_id=sensor_id, 
                sample_size=int(sample_size)
            )
        else:
            # Use original method for backward compatibility
            readings = db.get_readings_since(hours=hours, device_id=device_id, sensor_id=sensor_id)
        
        return jsonify({
            'status': 'success',
            'hours': hours,
            'count': len(readings),
            'readings': readings,
            'sampled': bool(sample_size)
        })
    except Exception as e:
        logger.error(f"Error retrieving history: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/humidity/stats', methods=['GET'])
def get_humidity_stats():
    """Get basic statistics about humidity readings"""
    device_id = request.args.get('device_id')
    sensor_id = request.args.get('sensor_id')
    hours = int(request.args.get('hours', 24))

    try:
        readings = db.get_readings_since(hours=hours, device_id=device_id, sensor_id=sensor_id)

        if not readings:
            return jsonify({
                'status': 'success',
                'message': 'No data available for the specified period'
            })

        humidity_values = [r['humidity_percent'] for r in readings]
        raw_values = [r['raw_value'] for r in readings]

        # Determine current humidity: aggregate across sensors when no specific sensor is requested
        current_humidity = None
        if humidity_values:
            if sensor_id:
                # Single sensor: most recent reading
                current_humidity = humidity_values[0]
            else:
                # Aggregate latest reading per sensor
                latest_per_sensor = {}
                for r in readings:
                    key = r['sensor_id'] or (f"pin_{r['sensor_pin']}" if r.get('sensor_pin') is not None else 'unknown')
                    if key not in latest_per_sensor:
                        latest_per_sensor[key] = r['humidity_percent']
                if latest_per_sensor:
                    current_humidity = sum(latest_per_sensor.values()) / len(latest_per_sensor)

        stats = {
            'status': 'success',
            'period_hours': hours,
            'total_readings': len(readings),
            'humidity': {
                'min': min(humidity_values),
                'max': max(humidity_values),
                'avg': sum(humidity_values) / len(humidity_values),
                'current': current_humidity
            },
            'raw_values': {
                'min': min(raw_values),
                'max': max(raw_values),
                'avg': sum(raw_values) / len(raw_values),
                'current': raw_values[0] if raw_values else None
            }
        }

        return jsonify(stats)

    except Exception as e:
        logger.error(f"Error calculating stats: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint with memory statistics"""
    try:
        memory_stats = db.get_memory_stats()
        return jsonify({
            'status': 'healthy',
            'timestamp': get_israel_timestamp(),
            'service': 'humidity_server',
            'memory_stats': memory_stats
        })
    except Exception as e:
        return jsonify({
            'status': 'healthy',
            'timestamp': get_israel_timestamp(),
            'service': 'humidity_server',
            'memory_stats': 'unavailable',
            'error': str(e)
        })


# Dashboard routes
@app.route('/')
def dashboard():
    """Main dashboard page"""
    return render_template('dashboard.html')


@app.route('/dashboard')
def dashboard_redirect():
    """Alternative dashboard route"""
    return render_template('dashboard.html')


@app.route('/memories')
def memories_page():
    """Memories page"""
    return render_template('memories.html')


@app.route('/api/devices')
def get_devices():
    """Get list of unique device IDs"""
    try:
        with db.get_connection() as conn:
            cursor = conn.execute('''
                SELECT DISTINCT device_id, 
                       COUNT(*) as reading_count,
                       MAX(created_at) as last_seen
                FROM humidity_readings 
                GROUP BY device_id
                ORDER BY last_seen DESC
            ''')
            devices = [dict(row) for row in cursor.fetchall()]
        
        return jsonify({
            'status': 'success',
            'devices': devices
        })
    except Exception as e:
        logger.error(f"Error getting devices: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/sensors')
def get_sensors():
    """Get list of sensors with device information"""
    try:
        with db.get_connection() as conn:
            cursor = conn.execute('''
                SELECT DISTINCT device_id, sensor_id, sensor_pin,
                       COUNT(*) as reading_count,
                       MAX(created_at) as last_seen,
                       AVG(humidity_percent) as avg_humidity
                FROM humidity_readings 
                WHERE sensor_id IS NOT NULL
                GROUP BY device_id, sensor_id, sensor_pin
                ORDER BY device_id, sensor_id
            ''')
            sensors = [dict(row) for row in cursor.fetchall()]
        
        return jsonify({
            'status': 'success',
            'sensors': sensors
        })
    except Exception as e:
        logger.error(f"Error getting sensors: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/devices/<device_id>/sensors')
def get_device_sensors(device_id):
    """Get sensors for a specific device"""
    try:
        with db.get_connection() as conn:
            cursor = conn.execute('''
                SELECT DISTINCT sensor_id, sensor_pin,
                       COUNT(*) as reading_count,
                       MAX(created_at) as last_seen,
                       AVG(humidity_percent) as avg_humidity
                FROM humidity_readings 
                WHERE device_id = ? AND sensor_id IS NOT NULL
                GROUP BY sensor_id, sensor_pin
                ORDER BY sensor_id
            ''', (device_id,))
            sensors = [dict(row) for row in cursor.fetchall()]
        
        return jsonify({
            'status': 'success',
            'device_id': device_id,
            'sensors': sensors
        })
    except Exception as e:
        logger.error(f"Error getting sensors for device {device_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/sensor-config', methods=['GET'])
def get_sensor_configs():
    """Get all sensor configurations with thresholds and alert states"""
    try:
        configs = db.get_all_sensor_configs()
        global_threshold = db.get_global_threshold()
        
        return jsonify({
            'status': 'success',
            'global_threshold': global_threshold,
            'sensor_configs': configs
        })
    except Exception as e:
        logger.error(f"Error getting sensor configs: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/sensor-config', methods=['POST'])
def update_sensor_configs():
    """Update sensor configurations (names, thresholds)"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        # Update global threshold if provided
        if 'global_threshold' in data:
            try:
                threshold = float(data['global_threshold'])
                if threshold > 0:
                    db.set_global_threshold(threshold)
                else:
                    return jsonify({'error': 'Global threshold must be positive'}), 400
            except ValueError:
                return jsonify({'error': 'Invalid global threshold value'}), 400
        
        # Update individual sensor configs if provided
        if 'sensor_configs' in data:
            for config in data['sensor_configs']:
                device_id = config.get('device_id')
                sensor_id = config.get('sensor_id')
                display_name = config.get('display_name')
                humidity_threshold = config.get('humidity_threshold')
                alerts_enabled = config.get('alerts_enabled')
                
                if not device_id or not sensor_id:
                    continue
                
                # Validate threshold if provided
                if humidity_threshold is not None:
                    try:
                        humidity_threshold = float(humidity_threshold)
                        if humidity_threshold < 0:  # Allow 0 as a valid threshold
                            humidity_threshold = None
                    except ValueError:
                        humidity_threshold = None
                
                db.update_sensor_config(device_id, sensor_id, display_name, humidity_threshold, alerts_enabled)
        
        return jsonify({'status': 'success', 'message': 'Configuration updated'})
        
    except Exception as e:
        logger.error(f"Error updating sensor configs: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/sensor-alerts/<device_id>/<sensor_id>', methods=['POST'])
def toggle_sensor_alerts(device_id, sensor_id):
    """Toggle alerts for a specific sensor"""
    try:
        data = request.get_json()
        enabled = data.get('enabled', True) if data else True
        
        db.set_sensor_alerts_enabled(device_id, sensor_id, enabled)
        
        action = "enabled" if enabled else "disabled"
        logger.info(f"Alerts {action} for sensor {device_id}:{sensor_id}")
        
        return jsonify({
            'status': 'success', 
            'message': f'Alerts {action} for sensor {sensor_id}',
            'alerts_enabled': enabled
        })
        
    except Exception as e:
        logger.error(f"Error toggling alerts for {device_id}:{sensor_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/memories', methods=['GET'])
def get_memories():
    """Get memories - latest one or all"""
    try:
        all_memories = request.args.get('all', 'false').lower() == 'true'
        
        if all_memories:
            memories = db.get_all_memories()
        else:
            latest = db.get_latest_memory()
            memories = [latest] if latest else []
        
        return jsonify({
            'status': 'success',
            'memories': memories
        })
    except Exception as e:
        logger.error(f"Error getting memories: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/memories', methods=['POST'])
def add_memory():
    """Add a new memory with optional photo"""
    start_time = time.time()
    try:
        logger.info("=== MEMORY ADDITION REQUEST STARTED ===")
        logger.info(f"Request method: {request.method}")
        logger.info(f"Content-Type: {request.content_type}")
        logger.info(f"Content-Length: {request.content_length}")
        logger.info(f"Files in request: {list(request.files.keys())}")
        logger.info(f"Form fields: {list(request.form.keys())}")

        # Handle multipart form data (for photo uploads)
        if 'photo' in request.files and request.files['photo'].filename:
            # Photo upload
            logger.info("=== PHOTO UPLOAD BRANCH DETECTED ===")
            photo_file = request.files['photo']
            user_name = request.form.get('user_name', '').strip()
            memory_text = request.form.get('memory_text', '').strip()
            rotation = request.form.get('rotation')  # Optional rotation parameter

            # Parse rotation if provided
            rotation_degrees = None
            if rotation:
                try:
                    rotation_degrees = int(rotation)
                    if rotation_degrees not in [0, 90, 180, 270]:
                        logger.warning(f"Invalid rotation value: {rotation}, ignoring")
                        rotation_degrees = None
                except ValueError:
                    logger.warning(f"Invalid rotation format: {rotation}, ignoring")
                    rotation_degrees = None

            logger.info(f"Photo upload detected - User: {user_name}, Filename: {photo_file.filename}, Text length: {len(memory_text)}, Rotation: {rotation_degrees}")

            if not photo_file or photo_file.filename == '':
                logger.warning("No photo file selected despite photo being in request")
                return jsonify({'error': 'No photo file selected'}), 400

            if not allowed_file(photo_file.filename):
                logger.warning(f"Invalid file type: {photo_file.filename}")
                return jsonify({'error': 'Invalid file type. Allowed: PNG, JPG, JPEG, GIF, WEBP'}), 400

            logger.info(f"Photo file validation passed: {photo_file.filename}")

        else:
            # Text-only memory (support both form and JSON)
            logger.info("=== TEXT-ONLY MEMORY BRANCH DETECTED ===")
            if request.content_type and request.content_type.startswith('multipart/form-data'):
                user_name = request.form.get('user_name', '').strip()
                memory_text = request.form.get('memory_text', '').strip()
                photo_file = None
                logger.info(f"Text-only memory (form) - User: {user_name}, Text length: {len(memory_text)}")
            else:
                data = request.get_json(silent=True)
                if not data:
                    logger.warning("No data provided for text-only memory (JSON branch)")
                    return jsonify({'error': 'No data provided'}), 400
                user_name = data.get('user_name', '').strip()
                memory_text = data.get('memory_text', '').strip()
                photo_file = None
                logger.info(f"Text-only memory (json) - User: {user_name}, Text length: {len(memory_text)}")
        
        if not user_name or not memory_text:
            logger.warning(f"Missing required fields - User: '{user_name}', Text: '{memory_text[:50] if memory_text else 'None'}'")
            return jsonify({'error': 'Both user_name and memory_text are required'}), 400
        
        if len(memory_text) > 1000:
            logger.warning(f"Memory text too long: {len(memory_text)} characters")
            return jsonify({'error': 'Memory text too long (max 1000 characters)'}), 400
        
        photo_filename = None
        
        # Process photo if uploaded
        if photo_file:
            try:
                photo_start_time = time.time()
                logger.info("=== STARTING PHOTO PROCESSING ===")
                logger.info(f"Photo file object: {type(photo_file)}")
                logger.info(f"Photo filename: {photo_file.filename}")
                logger.info(f"Photo content type: {getattr(photo_file, 'content_type', 'unknown')}")
                
                # Read photo data
                read_start_time = time.time()
                logger.info("Reading photo file data...")
                photo_data = photo_file.read()
                read_time = time.time() - read_start_time
                logger.info(f"Photo data read successfully - Size: {len(photo_data)} bytes, Time: {read_time:.3f}s")
                
                # Validate photo data
                if not photo_data:
                    logger.error("Photo file appears to be empty")
                    return jsonify({'error': 'Photo file is empty'}), 400
                
                # Resize photo
                resize_start_time = time.time()
                logger.info("Starting image resize process")
                resized_photo = resize_image(photo_data, rotation=rotation_degrees)
                resize_time = time.time() - resize_start_time
                logger.info(f"Image resized successfully - New size: {len(resized_photo)} bytes, Time: {resize_time:.3f}s")
                
                # Generate unique filename
                photo_filename = generate_photo_filename(photo_file.filename)
                photo_path = os.path.join(CONFIG['upload_folder'], photo_filename)
                logger.info(f"Generated photo filename: {photo_filename}, Path: {photo_path}")
                
                # Ensure upload directory exists
                os.makedirs(CONFIG['upload_folder'], exist_ok=True)
                logger.info(f"Upload directory verified: {CONFIG['upload_folder']}")
                
                # Save resized photo
                save_start_time = time.time()
                logger.info("Starting file write process")
                with open(photo_path, 'wb') as f:
                    f.write(resized_photo)
                save_time = time.time() - save_start_time
                logger.info(f"Photo file written successfully: {photo_filename}, Time: {save_time:.3f}s")
                
                # Verify file was saved
                if os.path.exists(photo_path):
                    file_size = os.path.getsize(photo_path)
                    logger.info(f"Photo file verified on disk - Size: {file_size} bytes")
                else:
                    logger.error(f"Photo file not found after saving: {photo_path}")
                    return jsonify({'error': 'Failed to save photo file'}), 500
                
                photo_total_time = time.time() - photo_start_time
                logger.info(f"Total photo processing time: {photo_total_time:.3f}s (Read: {read_time:.3f}s, Resize: {resize_time:.3f}s, Save: {save_time:.3f}s)")
                
            except Exception as e:
                logger.error(f"Error processing photo: {e}", exc_info=True)
                return jsonify({'error': 'Failed to process photo'}), 500
        
        # Add memory to database
        db_start_time = time.time()
        logger.info("Starting database insertion")
        memory_id = db.add_memory(user_name, memory_text, photo_filename)
        db_time = time.time() - db_start_time
        logger.info(f"Memory inserted into database successfully - ID: {memory_id}, Time: {db_time:.3f}s")
        
        # Get the created memory to return to client
        created_memory = db.get_memory_by_id(memory_id)
        
        total_time = time.time() - start_time
        logger.info(f"Memory addition completed successfully - User: {user_name}, ID: {memory_id}, Photo: {photo_filename}, Total time: {total_time:.3f}s, Text: {memory_text[:50]}...")
        
        return jsonify({
            'status': 'success',
            'message': 'Memory added successfully',
            'memory_id': memory_id,
            'memory': created_memory
        })
        
    except Exception as e:
        total_time = time.time() - start_time
        logger.error(f"Error adding memory after {total_time:.3f}s: {e}", exc_info=True)
        
        # If there was a photo file that was partially processed, try to clean it up
        if 'photo_filename' in locals() and photo_filename:
            try:
                photo_path = os.path.join(CONFIG['upload_folder'], photo_filename)
                if os.path.exists(photo_path):
                    os.remove(photo_path)
                    logger.info(f"Cleaned up partially processed photo: {photo_filename}")
            except Exception as cleanup_error:
                logger.error(f"Failed to cleanup photo file {photo_filename}: {cleanup_error}")
        
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/memories/<int:memory_id>', methods=['DELETE'])
def delete_memory(memory_id):
    """Delete a memory by ID"""
    try:
        success, message = db.delete_memory(memory_id)
        
        if success:
            logger.info(f"Memory {memory_id} deleted successfully")
            return jsonify({
                'status': 'success',
                'message': message
            })
        else:
            return jsonify({
                'status': 'error',
                'error': message
            }), 404
            
    except Exception as e:
        logger.error(f"Error deleting memory {memory_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/memories/photos/<filename>')
def serve_photo(filename):
    """Serve memory photos"""
    try:
        # Validate filename to prevent directory traversal
        secure_name = secure_filename(filename)
        if secure_name != filename:
            return jsonify({'error': 'Invalid filename'}), 400
        
        photo_path = os.path.join(CONFIG['upload_folder'], secure_name)
        
        if not os.path.exists(photo_path):
            return jsonify({'error': 'Photo not found'}), 404
        
        return send_file(photo_path)
        
    except Exception as e:
        logger.error(f"Error serving photo {filename}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


def cleanup_task():
    """Background task to cleanup old data"""
    while True:
        try:
            time.sleep(86400)  # Run every 24 hours
            deleted = db.cleanup_old_data(CONFIG['cleanup_days'])
            logger.info(f"Cleaned up {deleted} old sensor readings (memories preserved forever)")
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")


if __name__ == '__main__':
    logger.info(f"Starting humidity server on {CONFIG['host']}:{CONFIG['port']}")
    logger.info(f"Database: {CONFIG['database']}")
    logger.info(f"Log file: {CONFIG['log_file']}")

    # Start cleanup thread
    cleanup_thread = threading.Thread(target=cleanup_task, daemon=True)
    cleanup_thread.start()

    # Run Flask app
    app.run(
        host=CONFIG['host'],
        port=CONFIG['port'],
        debug=False,
        threaded=True
    )