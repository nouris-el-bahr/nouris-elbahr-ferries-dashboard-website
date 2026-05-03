FROM python:3.11-slim
WORKDIR /app

COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt gunicorn

COPY backend/ ./backend/

RUN addgroup --system --gid 1001 flask && \
    adduser --system --uid 1001 --ingroup flask flask && \
    chown -R flask:flask /app

USER flask

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-", "backend.app:app"]
