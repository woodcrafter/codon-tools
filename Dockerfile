FROM node:20-alpine AS base

RUN corepack enable
WORKDIR /app

RUN apk add --no-cache build-base gfortran make git
RUN git clone --depth 1 https://github.com/davidhoover/DNAWorks.git /opt/DNAWorks \
  && sed -i "s/(12x'  Tm Range = ',f4.1)/(12x,'  Tm Range = ',f4.1)/" /opt/DNAWorks/output.f90 \
  && make -C /opt/DNAWorks

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["pnpm", "start"]
