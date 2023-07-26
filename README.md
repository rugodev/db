# Rugo DB

DB Service for Rugo Platform

## Usage

```bash
node src/start.js

# or

npm run start
```

## Enviroments

- `PORT` port to mount
- `DIRECTORY` or set directory server to get config
- `MONGO` mongo db uri

## Incoming Request

Every request to this service, must have `x-rugo-schema` as a schema.

```json
{
  "name": "collection's name",
  "properties": {
    /* mongoose schema */
  }
}
```

## API

- **`GET /`** -> get/find by query conditions
- **`GET /:id`** -> get/find by query conditions and document id
- **`POST /`** -> create a new document
- **`PUT /:id`** -> replace document which found by document id and query conditions
- **`PATCH /:id`** -> update partial of document which found by document id and query conditions
- **`DELETE /:id`** -> delete a document which found by document id and query conditions

## Exception

```json
{
  "errors": [{ "type": "error type", "message": "error message" /* and more for tracking */ }]
}
```

## License

MIT.
