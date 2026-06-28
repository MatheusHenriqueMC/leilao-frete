"""
Garante que os imports de test_auth.py usem os modulos do auth-service,
mesmo quando notification ou auction ja inseriram server.py no sys.modules.
Usa importlib para carregar o server.py do auth diretamente pelo path absoluto.
"""

import importlib.util
import os
import sys

_auth_root = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))

# Carrega server.py do auth pelo path absoluto e registra no sys.modules
# com o nome 'auth_server' para evitar conflito com notification/server.py.
_server_path = os.path.join(_auth_root, "server.py")
_spec = importlib.util.spec_from_file_location("auth_server", _server_path)
_auth_server_mod = importlib.util.module_from_spec(_spec)

# Garante que o auth_root esteja no sys.path para que o auth_server
# consiga importar database.py e os pb2 corretamente.
if _auth_root not in sys.path:
    sys.path.insert(0, _auth_root)
_generated = os.path.join(_auth_root, "generated")
if _generated not in sys.path:
    sys.path.insert(0, _generated)

sys.modules["auth_server"] = _auth_server_mod
_spec.loader.exec_module(_auth_server_mod)
