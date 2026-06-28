"""
Adiciona o diretorio tests/ ao sys.path para que helpers.py seja importavel.
"""

import os
import sys

_tests_dir = os.path.dirname(__file__)
if _tests_dir not in sys.path:
    sys.path.insert(0, _tests_dir)
