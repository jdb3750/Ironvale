FROM python:3.12-slim
WORKDIR /opt/ironvale
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY VERSION .
COPY app ./app
COPY static ./static
# Runtime data read by app/imported_exercises.py. Anything the app opens at
# runtime from outside app/ and static/ must be copied here or it silently
# degrades in the container while working locally.
COPY vendor ./vendor
ENV DATA_DIR=/data
VOLUME /data
EXPOSE 8321
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8321"]
