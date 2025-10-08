# crashmap

## Changelog

### 2025-10-07
- Fixed Azure deployment configuration for .NET:
  - Updated GitHub Actions workflow to use publish profile authentication
  - Removed conflicting Azure CLI login and startup-command steps
  - Ensured workflow triggers on all deployment branches
  - Added MySQL connection string to appsettings files
  - Enhanced web.config for .NET Core hosting
  - Provided instructions to set Azure App Service runtime to .NET 9