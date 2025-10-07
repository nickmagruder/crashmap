#!/bin/bash
# Azure App Service startup script for .NET applications

echo "Starting .NET application..."
echo "Current directory: $(pwd)"
echo "Contents: $(ls -la)"

# Ensure executable permissions
chmod +x crashmap.Server

# Start the application
exec dotnet crashmap.Server.dll