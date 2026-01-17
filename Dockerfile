FROM python:3.10

# Switch to root to install packages
USER root

# Install system dependencies
RUN apt-get update && apt-get install -y \
    cmake \
    g++ \
    make \
    gnupg \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install MongoDB
RUN wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | apt-key add - \
    && echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/debian bullseye/mongodb-org/6.0 main" | tee /etc/apt/sources.list.d/mongodb-org-6.0.list \
    && apt-get update && apt-get install -y mongodb-org \
    && rm -rf /var/lib/apt/lists/*

# Set up MongoDB directory (writable by user 1000)
RUN mkdir -p /data/db && \
    mkdir -p /var/log/mongodb && \
    chown -R 1000:1000 /data/db && \
    chown -R 1000:1000 /var/log/mongodb

WORKDIR /code

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Copy application code
COPY . .

# Set permissions for the working directory
RUN chown -R 1000:1000 /code

# Switch to user 1000 for Hugging Face Spaces
USER 1000

# Copy startup script and make executable
COPY start.sh .
RUN chmod +x start.sh

CMD ["./start.sh"]
