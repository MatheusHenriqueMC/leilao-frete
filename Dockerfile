FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Gera stubs gRPC automaticamente
RUN python -m grpc_tools.protoc -I protos/ --python_out=generated/ --grpc_python_out=generated/ protos/freight.proto