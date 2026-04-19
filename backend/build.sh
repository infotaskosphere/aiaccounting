#!/usr/bin/env bash
# backend/build.sh
set -e

# System dependencies
apt-get update -qq
apt-get install -y -qq \
  tesseract-ocr \
  tesseract-ocr-eng \
  poppler-utils \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libcairo2 \
  libgdk-pixbuf2.0-0 \
  libffi-dev \
  shared-mime-info

# Python dependencies
pip install -r requirements.txt
