#!/bin/sh
set -eu

pip install --no-cache-dir -r /workspace/tests/pytest/requirements.txt
python -m pytest "$@"
