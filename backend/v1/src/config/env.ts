interface Config {
  nodeEnv: string
  port: number
  mongoUri: string
  jwtSecret: string
  jwtRefreshSecret: string
  jwtExpiresIn: any
}

export const config: Config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/gym',
  jwtSecret: process.env.JWT_SECRET || 'your_jwt_secret_here',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your_refresh_secret_here',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d'
}

export const firebaseConfig = {
  apiKey: "AIzaSyAEyG6RTLLcPxUFi0bP-gb5c1LddGjpZns",
  authDomain: "mosn-project-app.firebaseapp.com",
  projectId: "mosn-project-app",
  storageBucket: "mosn-project-app.firebasestorage.app",
  messagingSenderId: "241880863309",
  appId: "1:241880863309:web:c0f381364f8568a8448204",
  measurementId: "G-01TDCKXE7F"
}