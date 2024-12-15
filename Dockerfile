# Use an official Python runtime as a parent image
FROM python:3.9.13-slim

# Set the working directory inside the container
WORKDIR /app

# Copy the requirements.txt into the container
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Add local binary path to PATH
ENV PATH="/root/.local/bin:${PATH}"

# Copy the current directory contents into the container
COPY . .

# Expose port 5000
EXPOSE 5000

# Run the application using Gunicorn
CMD ["python3", "-m", "gunicorn", "--bind", "0.0.0.0:5000", "backend.app:app"]
