FROM debian:stable-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    gfortran \
    make \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY . .
RUN make


FROM python:3.12-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgfortran5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/dnaworks
COPY --from=builder /src/dnaworks /opt/dnaworks/dnaworks
COPY --from=builder /src/DNAWORKS.inp /opt/dnaworks/DNAWORKS.inp
COPY web /opt/dnaworks/web

RUN pip install --no-cache-dir -r /opt/dnaworks/web/requirements.txt

ENV DNAWORKS_BIN=/opt/dnaworks/dnaworks
WORKDIR /opt/dnaworks/web
EXPOSE 8080

CMD ["python", "app.py"]
