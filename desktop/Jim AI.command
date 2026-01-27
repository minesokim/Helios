#!/bin/bash
# Jim AI Desktop - Double-click to run

cd "$(dirname "$0")"

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | xargs)
fi

# Run the app
/usr/bin/python3 main.py
