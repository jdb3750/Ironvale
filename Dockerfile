FROM python:3.12-slim
WORKDIR /opt/ironvale
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY static ./static
ENV DATA_DIR=/data
VOLUME /data
EXPOSE 8321
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8321"]
