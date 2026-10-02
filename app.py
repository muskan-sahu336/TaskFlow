import os
from functools import wraps

import psycopg2
from psycopg2 import errors
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from flask import Flask, request, jsonify, session, render_template, redirect
from werkzeug.security import generate_password_hash, check_password_hash

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY")


def get_db():
    return psycopg2.connect(os.getenv("DATABASE_URL"), cursor_factory=RealDictCursor)


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Login required"}), 401
        return f(*args, **kwargs)
    return wrapper


@app.route("/")
def home():
    if "user_id" in session:
        return redirect("/dashboard")
    return render_template("login.html")


@app.route("/dashboard")
def dashboard():
    if "user_id" not in session:
        return redirect("/")
    return render_template("dashboard.html")


@app.route("/api/health")
def health():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            return jsonify(cur.fetchone())
    finally:
        conn.close()


@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not username or not email or len(password) < 6:
        return jsonify({"error": "Username, email and a password of 6+ characters are required"}), 400

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s) RETURNING id",
                (username, email, generate_password_hash(password)),
            )
            user_id = cur.fetchone()["id"]
        conn.commit()
    except errors.UniqueViolation:
        conn.rollback()
        return jsonify({"error": "Username or email already exists"}), 409
    finally:
        conn.close()

    session["user_id"] = user_id
    return jsonify({"message": "Registered", "username": username}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, username, password_hash FROM users WHERE email = %s", (email,))
            user = cur.fetchone()
    finally:
        conn.close()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid email or password"}), 401

    session["user_id"] = user["id"]
    return jsonify({"message": "Logged in", "username": user["username"]})


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out"})


@app.route("/api/me")
@login_required
def me():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, username FROM users WHERE id = %s", (session["user_id"],))
            return jsonify(cur.fetchone())
    finally:
        conn.close()
        
VALID_STATUS = {"pending", "in_progress", "done"}
VALID_PRIORITY = {"low", "medium", "high"}


def serialize(task):
    for key in ("due_date", "created_at", "updated_at"):
        if task.get(key):
            task[key] = task[key].isoformat()
    return task


def read_task_data(data):
    title = (data.get("title") or "").strip()
    status = data.get("status", "pending")
    priority = data.get("priority", "medium")
    if not title:
        return None, "Title is required"
    if status not in VALID_STATUS or priority not in VALID_PRIORITY:
        return None, "Invalid status or priority"
    return {
        "title": title,
        "description": (data.get("description") or "").strip(),
        "status": status,
        "priority": priority,
        "due_date": data.get("due_date") or None,
    }, None


@app.route("/api/tasks", methods=["GET"])
@login_required
def list_tasks():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM tasks WHERE user_id = %s ORDER BY created_at DESC",
                (session["user_id"],),
            )
            return jsonify([serialize(t) for t in cur.fetchall()])
    finally:
        conn.close()


@app.route("/api/tasks", methods=["POST"])
@login_required
def create_task():
    task, error = read_task_data(request.get_json() or {})
    if error:
        return jsonify({"error": error}), 400

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO tasks (user_id, title, description, status, priority, due_date)
                   VALUES (%s, %s, %s, %s, %s, %s) RETURNING *""",
                (session["user_id"], task["title"], task["description"],
                 task["status"], task["priority"], task["due_date"]),
            )
            created = cur.fetchone()
        conn.commit()
        return jsonify(serialize(created)), 201
    finally:
        conn.close()


@app.route("/api/tasks/<int:task_id>", methods=["PUT"])
@login_required
def update_task(task_id):
    task, error = read_task_data(request.get_json() or {})
    if error:
        return jsonify({"error": error}), 400

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE tasks
                   SET title = %s, description = %s, status = %s, priority = %s,
                       due_date = %s, updated_at = NOW()
                   WHERE id = %s AND user_id = %s RETURNING *""",
                (task["title"], task["description"], task["status"], task["priority"],
                 task["due_date"], task_id, session["user_id"]),
            )
            updated = cur.fetchone()
        conn.commit()
        if not updated:
            return jsonify({"error": "Task not found"}), 404
        return jsonify(serialize(updated))
    finally:
        conn.close()


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
@login_required
def delete_task(task_id):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM tasks WHERE id = %s AND user_id = %s RETURNING id",
                (task_id, session["user_id"]),
            )
            deleted = cur.fetchone()
        conn.commit()
        if not deleted:
            return jsonify({"error": "Task not found"}), 404
        return jsonify({"message": "Task deleted"})
    finally:
        conn.close()

if __name__ == "__main__":
    app.run(debug=True)