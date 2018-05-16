FROM node:9.11.1-alpine
RUN apk update && apk --no-cache add git python alpine-sdk
RUN npm install -g webpack babel-cli truffle-contract
ADD package.json /tmp/package.json
RUN cd /tmp && npm install && npm install truffle-contract && npm install --only=dev 

RUN mkdir -p /app && cp -a /tmp/node_modules /app/

COPY . /app/
RUN cd /app && npm run build

WORKDIR /app
