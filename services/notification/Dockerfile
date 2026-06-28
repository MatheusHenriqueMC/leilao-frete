FROM python:3.12-slim

WORKDIR /app

COPY services/notification/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY protos/notification.proto ./protos/notification.proto
COPY services/notification/ ./

RUN mkdir -p generated && \
    python -m grpc_tools.protoc -I protos/ \
      --python_out=generated/ --grpc_python_out=generated/ protos/notification.proto

CMD ["python", "server.py"]
