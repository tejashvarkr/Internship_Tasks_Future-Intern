from flask import Flask, render_template, request, jsonify
import sqlite3
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# DB initialization
def init_db():
    with sqlite3.connect("employees.db") as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS employees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                role TEXT NOT NULL
            )
        ''')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/employees', methods=['GET'])
def get_employees():
    with sqlite3.connect("employees.db") as conn:
        cursor = conn.execute("SELECT * FROM employees")
        employees = [dict(id=row[0], name=row[1], email=row[2], role=row[3]) for row in cursor.fetchall()]
    return jsonify(employees)

@app.route('/employees', methods=['POST'])
def add_employee():
    data = request.json
    with sqlite3.connect("employees.db") as conn:
        conn.execute("INSERT INTO employees (name, email, role) VALUES (?, ?, ?)",
                     (data['name'], data['email'], data['role']))
    return jsonify({"message": "Employee added"}), 201

@app.route('/employees/<int:id>', methods=['PUT'])
def update_employee(id):
    data = request.json
    with sqlite3.connect("employees.db") as conn:
        conn.execute("UPDATE employees SET name=?, email=?, role=? WHERE id=?",
                     (data['name'], data['email'], data['role'], id))
    return jsonify({"message": "Employee updated"})

@app.route('/employees/<int:id>', methods=['DELETE'])
def delete_employee(id):
    with sqlite3.connect("employees.db") as conn:
        conn.execute("DELETE FROM employees WHERE id=?", (id,))
    return jsonify({"message": "Employee deleted"})

if __name__ == '__main__':
    init_db()
    app.run(debug=True)
