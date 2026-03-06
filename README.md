# victron-energy-api
A small express project to expose the Victron II GX informations to link other projects to it.

### Build
```
docker build -t victron-api .
```

### Launch the docker
```
docker run -d \
  --name victron-api \
  --env-file .env \
  -p 3000:3000 \
  victron-api
```

### Launch the app without docker
```
cp .env.example .env
npm install
npm start
```