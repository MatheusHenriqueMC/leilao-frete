FROM python:3.12-slim

WORKDIR /app

COPY services/auth/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Proto e codigo do servico
COPY protos/auth.proto ./protos/auth.proto
COPY services/auth/ ./

# Gera os stubs gRPC do auth.proto
RUN mkdir -p generated && \
    python -m grpc_tools.protoc -I protos/ \
      --python_out=generated/ --grpc_python_out=generated/ protos/auth.proto

CMD ["python", "server.py"]
