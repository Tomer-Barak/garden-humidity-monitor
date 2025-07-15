#!/usr/bin/env python3

import json
import logging
from logging.handlers import RotatingFileHandler
import sqlite3
import threading
import time
from datetime import datetime
from flask import Flask, request, jsonify, render_template, send_from_directory
from contextlib import contextmanager
import os
import pytz

# Configuration
CONFIG = {
    'host': '0.0.0.0',  # Listen on all interfaces
    'port': 8080,
    'database': 'humidity.db',
    'log_file': 'humidity_server.log',
    'log_level': logging.INFO,
    'cleanup_days': 30,  # Keep data for 30 days
    'timezone': 'Asia/Jerusalem'  # Israel timezone
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


# Timezone configuration
ISRAEL_TZ = pytz.timezone(CONFIG['timezone'])


def get_israel_time():
    """Get current time in Israel timezone"""
    return datetime.now(ISRAEL_TZ)


def get_israel_timestamp():
    """Get current timestamp string in Israel timezone"""
    return get_israel_time().isoformat()


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
            conn.execute('''
                         CREATE INDEX IF NOT EXISTS idx_device_timestamp
                             ON humidity_readings(device_id, created_at)
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

    def insert_reading(self, device_id, raw_value, humidity_percent, esp32_timestamp):
        """Insert a new humidity reading"""
        server_timestamp = get_israel_timestamp()

        with self.get_connection() as conn:
            conn.execute('''
                         INSERT INTO humidity_readings
                         (device_id, raw_value, humidity_percent, esp32_timestamp, server_timestamp)
                         VALUES (?, ?, ?, ?, ?)
                         ''', (device_id, raw_value, humidity_percent, esp32_timestamp, server_timestamp))
            conn.commit()

    def get_latest_readings(self, device_id=None, limit=100):
        """Get latest readings, optionally filtered by device"""
        query = '''
                SELECT id, device_id, raw_value, humidity_percent, esp32_timestamp, 
                       server_timestamp, server_timestamp as created_at
                FROM humidity_readings
                WHERE (? IS NULL OR device_id = ?)
                ORDER BY created_at DESC LIMIT ?
                '''

        with self.get_connection() as conn:
            cursor = conn.execute(query, (device_id, device_id, limit))
            return [dict(row) for row in cursor.fetchall()]

    def get_readings_since(self, hours=24, device_id=None):
        """Get readings from the last N hours"""
        query = '''
            SELECT id, device_id, raw_value, humidity_percent, esp32_timestamp, 
                   server_timestamp, server_timestamp as created_at
            FROM humidity_readings 
            WHERE (? IS NULL OR device_id = ?)
            AND created_at > datetime('now', '-{} hours')
            ORDER BY created_at DESC
        '''.format(hours)

        with self.get_connection() as conn:
            cursor = conn.execute(query, (device_id, device_id))
            return [dict(row) for row in cursor.fetchall()]

    def cleanup_old_data(self, days=30):
        """Remove data older than specified days"""
        with self.get_connection() as conn:
            cursor = conn.execute('''
                DELETE FROM humidity_readings 
                WHERE created_at < datetime('now', '-{} days')
            '''.format(days))
            deleted_count = cursor.rowcount
            conn.commit()
            return deleted_count


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

        # Insert into database
        db.insert_reading(
            device_id=data['device_id'],
            raw_value=data['raw_value'],
            humidity_percent=data['humidity_percent'],
            esp32_timestamp=data.get('timestamp')
        )

        logger.info(f"Received data from {data['device_id']}: "
                    f"Raw={data['raw_value']}, Humidity={data['humidity_percent']}%")

        return jsonify({'status': 'success', 'message': 'Data received'}), 200

    except Exception as e:
        logger.error(f"Error processing humidity data: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/humidity/latest', methods=['GET'])
def get_latest_humidity():
    """Get latest humidity readings"""
    device_id = request.args.get('device_id')
    limit = int(request.args.get('limit', 100))

    try:
        readings = db.get_latest_readings(device_id=device_id, limit=limit)
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
    """Get humidity readings from the last N hours"""
    device_id = request.args.get('device_id')
    hours = int(request.args.get('hours', 24))

    try:
        readings = db.get_readings_since(hours=hours, device_id=device_id)
        return jsonify({
            'status': 'success',
            'hours': hours,
            'count': len(readings),
            'readings': readings
        })
    except Exception as e:
        logger.error(f"Error retrieving history: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/humidity/stats', methods=['GET'])
def get_humidity_stats():
    """Get basic statistics about humidity readings"""
    device_id = request.args.get('device_id')
    hours = int(request.args.get('hours', 24))

    try:
        readings = db.get_readings_since(hours=hours, device_id=device_id)

        if not readings:
            return jsonify({
                'status': 'success',
                'message': 'No data available for the specified period'
            })

        humidity_values = [r['humidity_percent'] for r in readings]
        raw_values = [r['raw_value'] for r in readings]

        stats = {
            'status': 'success',
            'period_hours': hours,
            'total_readings': len(readings),
            'humidity': {
                'min': min(humidity_values),
                'max': max(humidity_values),
                'avg': sum(humidity_values) / len(humidity_values),
                'current': humidity_values[0] if humidity_values else None
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
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': get_israel_timestamp(),
        'service': 'humidity_server'
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


def cleanup_task():
    """Background task to cleanup old data"""
    while True:
        try:
            time.sleep(86400)  # Run every 24 hours
            deleted = db.cleanup_old_data(CONFIG['cleanup_days'])
            logger.info(f"Cleaned up {deleted} old records")
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