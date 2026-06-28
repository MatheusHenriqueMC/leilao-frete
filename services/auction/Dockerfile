FROM python:3.12-slim

WORKDIR /app

COPY services/auction/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Proto e codigo do servico
COPY protos/auction.proto ./protos/auction.proto
COPY services/auction/ ./

# Gera os stubs gRPC do auction.proto
RUN mkdir -p generated && \
    python -m grpc_tools.protoc -I protos/ \
      --python_out=generated/ --grpc_python_out=generated/ protos/auction.proto

CMD ["python", "server.py"]
