# Image Node officielle
FROM node:20-alpine

# Dossier de travail
WORKDIR /app

# Copier uniquement les fichiers nécessaires pour installer les dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm install --production

# Copier le reste du projet
COPY . .

# Port utilisé par Express
EXPOSE 3000

# Lancer l'application
CMD ["npm", "start"]