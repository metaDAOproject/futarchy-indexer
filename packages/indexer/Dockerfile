FROM node:alpine3.18
RUN corepack prepare pnpm@8.7.1 --activate
RUN corepack enable
ENV REPO_DIR /home/indexer/futarchy-indexer
RUN mkdir -p $REPO_DIR
WORKDIR $REPO_DIR
COPY . .
RUN pnpm install
CMD ["pnpm", "start-service"]
