FROM python:3.12-slim

WORKDIR /app

COPY gateway/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# O gateway fala com os tres servicos, entao gera os stubs dos tres protos
COPY protos/auth.proto ./protos/auth.proto
COPY protos/auction.proto ./protos/auction.proto
COPY protos/notification.proto ./protos/notification.proto
COPY gateway/ ./

RUN mkdir -p generated && \
    python -m grpc_tools.protoc -I protos/ \
      --python_out=generated/ --grpc_python_out=generated/ \
      protos/auth.proto protos/auction.proto protos/notification.proto

CMD ["python", "gateway.py"]
