# Project Creation Guide

This file explains how Visual Studio created the project.

The following tools were used to generate this project:

- create-vite

The following steps were used to generate this project:

- Create react project with create-vite: `npm init --yes vite@latest crashmap.client -- --template=react-ts`.
- Create project file (`crashmap.client.esproj`).
- Create `launch.json` to enable debugging.
- Create `tasks.json` to enable debugging.
- Add project to solution.
- Update proxy endpoint to be the backend server endpoint.
- Write this file.

## Changelog

- 10/6/2025 - Initiated app using Visual Studio TypeScript/React/.NET Template and made initial commit
- 10/6/2025 - Deployed template app on Azure after some troubleshooting
- 10/23/2025 - Tailwind and Mapbox Installed
- 10/22/2025 - Added initial demo data scraped from WSDOT site
- 10/27/2025 - Installed Tanstack router and mapbox icons, started building project folder skeleton
- 11/5/2025 - Rough Map Build (with buttons, etc)
