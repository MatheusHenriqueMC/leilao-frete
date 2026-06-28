"""
Configuracao do pytest do notification-service: poe a raiz do servico e os stubs
gRPC gerados no sys.path para que 'server' e os _pb2 sejam importaveis flat.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "generated"))
