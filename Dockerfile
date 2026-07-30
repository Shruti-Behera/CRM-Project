# =====================================================================
#  Ashika WDM — single image containing the React app + the .NET API.
#  Build: docker build -t ashika-wdm .
#  (usually you don't run this directly — use docker compose, see below)
# =====================================================================

# ---- 1. build the React client ----
FROM node:20-alpine AS client
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build            # outputs /client/dist (includes public/ logos)

# ---- 2. build & publish the .NET server (serves the client from wwwroot) ----
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS server
WORKDIR /src
COPY Server/AshikaWdm.csproj Server/
RUN dotnet restore Server/AshikaWdm.csproj
COPY Server/ Server/
COPY --from=client /client/dist Server/wwwroot
RUN dotnet publish Server/AshikaWdm.csproj -c Release -o /app /p:UseAppHost=false

# ---- 3. slim runtime image ----
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=server /app ./
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
ENTRYPOINT ["dotnet", "AshikaWdm.dll"]
