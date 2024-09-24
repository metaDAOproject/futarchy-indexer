FROM node:alpine3.18

# Some of the dependencies require node-gyp
RUN apk add --no-cache python3 make g++
RUN if [ ! -e /usr/bin/python ]; then ln -sf python3 /usr/bin/python ; fi

# Bun requires glibc https://github.com/oven-sh/bun/issues/5545#issuecomment-1722306576
RUN apk --no-cache add ca-certificates wget
RUN wget -q -O /etc/apk/keys/sgerrand.rsa.pub https://alpine-pkgs.sgerrand.com/sgerrand.rsa.pub
RUN wget https://github.com/sgerrand/alpine-pkg-glibc/releases/download/2.28-r0/glibc-2.28-r0.apk
RUN apk add --no-cache --force-overwrite glibc-2.28-r0.apk

RUN apk add --no-cache git

EXPOSE 8080
RUN corepack prepare pnpm@9.11.0 --activate
RUN corepack enable
ENV REPO_DIR /home/indexer/futarchy-indexer
RUN mkdir -p $REPO_DIR
WORKDIR $REPO_DIR
COPY . .
RUN pnpm install
CMD ["pnpm", "start-service"]
