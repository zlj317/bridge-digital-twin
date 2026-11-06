FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_DATA_MODE=live
ARG VITE_API_BASE=/api/v1
ARG VITE_MQTT_WS_URL=ws://localhost:8083/mqtt
ENV VITE_DATA_MODE=$VITE_DATA_MODE \
    VITE_API_BASE=$VITE_API_BASE \
    VITE_MQTT_WS_URL=$VITE_MQTT_WS_URL
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build
CMD ["sleep", "infinity"]
