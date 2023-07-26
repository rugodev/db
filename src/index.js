import process from 'node:process';
import { createConnection } from './mongoose.next.js';
import { createService } from '@rugo/service';
import { DB_SERVICE_NAME, SCHEMA_HEADER } from './constants.js';
import { buildQuery, pagination, parseSchema, prepare, resp } from './methods.js';
import { makeResponse } from '@rugo/service/src/handlers.js';

export const startService = async () => {
  // config
  const mongoUri = process.env.MONGO;
  if (!mongoUri) {
    throw new Error('Mongo settings was not defined.');
  }

  // service
  const service = await createService({
    name: DB_SERVICE_NAME,
    port: process.env.PORT,
    directory: process.env.DIRECTORY
  });

  // mongo
  const client = await createConnection(mongoUri).asPromise();
  client.getClient().db();

  // middleware
  service.use(async (ctx, next) => {
    const schema = parseSchema(ctx.headers[SCHEMA_HEADER]);
    if (!schema || !schema.name) return makeResponse(ctx, { status: 404 });

    ctx.schema = schema;
    ctx.logs.unshift(`[${schema.name}]`);

    await next();
  });

  // api
  service.post('/', async (ctx) => {
    const { model } = prepare(client, ctx.schema);
    const { form } = ctx;

    makeResponse(ctx, { body: resp(await model.create(form)) });
  });

  service.get(['/', '/:id'], async (ctx) => {
    const { model } = prepare(client, ctx.schema);

    let { filters, sort, skip, limit, page } = buildQuery({ id: ctx.params.id, query: ctx.query });
    let queryBuilder = filters._id ? model.findOne(filters) : model.find(filters);

    // filter
    if (Object.keys(sort).length > 0) {
      queryBuilder = queryBuilder.sort(sort);
    }

    if (skip) {
      queryBuilder = queryBuilder.skip(skip);
    }

    if (limit !== -1) {
      queryBuilder = queryBuilder.limit(limit);
    }

    // request data
    const data = await queryBuilder.exec();
    const nextData = Array.isArray(data) ? data : [data];

    // response
    const total = await model.countDocuments(filters);
    const meta = pagination({ skip, limit, total, page });

    makeResponse(ctx, {
      body: {
        data: nextData.filter((i) => i).map(resp),
        meta
      }
    });
  });

  service.put('/:id', async (ctx) => {
    const { model } = prepare(client, ctx.schema);
    const { filters } = buildQuery({ id: ctx.params.id, query: ctx.query });
    const { form } = ctx;

    form.version = 0;

    makeResponse(ctx, {
      body: resp(
        await model.findOneAndReplace(filters, form, {
          returnDocument: 'after',
          runValidators: true
        })
      )
    });
  });

  service.patch('/:id', async (ctx) => {
    const { model } = prepare(client, ctx.schema);
    const { filters } = buildQuery({ id: ctx.params.id, query: ctx.query });
    const { form } = ctx;

    const set = form?.set || {};
    const inc = form?.inc || {};
    const unset = form?.unset || {};

    set.updatedAt = new Date().toISOString();
    inc.version = 1;

    delete set.version;

    makeResponse(ctx, {
      body: resp(
        await model.findOneAndUpdate(
          filters,
          {
            $set: set,
            $inc: inc,
            $unset: unset
          },
          { returnDocument: 'after', runValidators: true }
        )
      )
    });
  });

  service.delete('/:id', async (ctx) => {
    const { model } = prepare(client, ctx.schema);
    const { filters } = buildQuery({ id: ctx.params.id, query: ctx.query });
    makeResponse(ctx, { body: resp(await model.findOneAndRemove(filters)) });
  });

  // wrap stop
  service._stop = service.stop;
  service.stop = async () => {
    await client.close();
    return await service._stop();
  };

  // start
  await service.start();

  return service;
};
