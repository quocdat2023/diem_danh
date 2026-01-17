# Use Python 3.9
FROM python:3.9

# Set working directory
WORKDIR /app

# Install system dependencies for dlib
# Note: python:3.9-slim might be smaller but full image has more tools.
# We ensure cmake and build tools are present.
RUN apt-get update && apt-get install -y \
    cmake \
    build-essential \
    libopenblas-dev \
    liblapack-dev \
    libx11-dev \
    libgtk-3-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip and install build tools (wheel, setuptools)
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Set permissions for user 1000
RUN chown -R 1000:1000 /app

# Switch to user 1000
USER 1000

# Copy requirements and install
COPY --chown=1000:1000 requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY --chown=1000:1000 . .

# Expose port 7860
EXPOSE 7860

# Make start script executable
RUN chmod +x start.sh

# Start using the script
CMD ["./start.sh"]
