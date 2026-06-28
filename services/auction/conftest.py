"""
Configuracao do pytest do auction-service: poe a raiz do servico no sys.path
para que 'state', 'database' e 'notifier' sejam importaveis como modulos flat.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
