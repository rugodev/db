import process from 'node:process';
import chai, { expect } from 'chai';
import chaiHttp from 'chai-http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { startService } from '../src/index.js';
import { SCHEMA_HEADER } from '../src/constants.js';

const TEST_PORT = 8080;
const TEST_DB = 'test';
const TEST_SCHEMA = {
  name: 'people',
  properties: {
    name: { type: 'string', required: true, unique: true },
    title: { type: 'string' },
    slug: {
      type: 'string'
    },
    age: { type: 'number', min: 0 },
    dob: { type: 'date' },
    parent: {
      properties: {
        foo: { type: 'string' },
        bar: { type: 'string' },
        count: {
          type: 'number',
          default: 0,
          max: 100
        },
        complex: {
          type: 'array',
          items: {
            properties: {
              more: { type: 'string', required: true }
            }
          }
        }
      }
    },
    schemas: {
      type: 'array',
      items: {
        type: 'object'
      }
    }
  }
};

chai.use(chaiHttp);

describe('DB Service test', function () {
  const address = `http://localhost:${TEST_PORT}`;
  let service, mongod, docId;

  before(async () => {
    mongod = await MongoMemoryServer.create({
      instance: {
        dbName: TEST_DB
      }
    });

    process.env.PORT = TEST_PORT;
    process.env.MONGO = `${mongod.getUri()}${TEST_DB}`;

    service = await startService();
  });

  after(async () => {
    await service.stop();
    await mongod.stop();
  });

  it('should not request without schema', async () => {
    const res = await chai.request(address).post('/').send({ name: 'alice' });

    expect(res).to.has.property('text', 'Not Found');
    expect(res).to.has.property('status', 404);
  });

  it('should create docs', async () => {
    const res = await chai
      .request(address)
      .post('/')
      .set(SCHEMA_HEADER, JSON.stringify(TEST_SCHEMA))
      .send({
        name: 'foo',
        title: 'Some Foo Đờ 123 # Go go',
        age: 3,
        dob: '2022/02/12',
        parent: { foo: 'a', bar: 'b' }
      });

    expect(res.body).to.has.property('id');
    expect(res.body).to.has.property('name', 'foo');
    expect(res.body).to.has.property('title', 'Some Foo Đờ 123 # Go go');
    expect(res.body).to.has.property('age', 3);
    expect(res.body).to.has.property('createdAt');
    expect(res.body).to.has.property('updatedAt');
    expect(res.body).to.has.property('version', 0);
    expect(res).to.has.property('status', 200);

    // many
    for (let i = 0; i < 3; i++) {
      await chai
        .request(address)
        .post('/')
        .set(SCHEMA_HEADER, JSON.stringify(TEST_SCHEMA))
        .send({
          name: 'many_' + i,
          age: 999
        });
    }
  });

  it('should find docs', async () => {
    const res = await chai
      .request(address)
      .get(`/?name=foo&sort[createdAt]=-1`)
      .set(SCHEMA_HEADER, JSON.stringify(TEST_SCHEMA));

    expect(res.body).to.has.property('data');
    expect(res.body.data).to.has.property('length', 1);

    const doc = res.body.data[0];
    expect(doc).to.has.property('id');
    expect(doc).to.has.property('name', 'foo');
    expect(doc).to.has.property('age', 3);
    expect(res).to.has.property('status', 200);

    docId = doc.id;

    const res2 = await chai
      .request(address)
      .get(`/${docId}?name=foo&sort[createdAt]=-1`)
      .set(SCHEMA_HEADER, JSON.stringify(TEST_SCHEMA));

    expect(res2.body).to.has.property('data');
    expect(res2.body.data).to.has.property('length', 1);

    const doc2 = res.body.data[0];
    expect(doc2).to.has.property('id');
    expect(doc2).to.has.property('name', 'foo');
    expect(doc2).to.has.property('age', 3);
    expect(doc2).to.has.property('title', 'Some Foo Đờ 123 # Go go');
    expect(doc2).to.has.property('createdAt');
    expect(doc2).to.has.property('updatedAt');
    expect(doc2).to.has.property('version', 0);
    expect(res2).to.has.property('status', 200);

    const { body: data } = await chai
      .request(address)
      .get(`/?age=999&skip=1&limit=1`)
      .set(SCHEMA_HEADER, JSON.stringify(TEST_SCHEMA));

    expect(data.data).to.has.property('length', 1);
    expect(data.meta).to.has.property('total', 3);
    expect(data.meta).to.has.property('skip', 1);
    expect(data.meta).to.has.property('limit', 1);
    expect(data.meta).to.has.property('page', 2);
    expect(data.meta).to.has.property('npage', 3);
  });

  it('should find docs with special filters conditions', async () => {
    const { body: data } = await chai
      .request(address)
      .get(`/?age[$lt]=100`)
      .set(SCHEMA_HEADER, JSON.stringify(TEST_SCHEMA));

    expect(data.data).to.has.property('length', 1);
    expect(data.meta).to.has.property('total', 1);
    expect(data.meta).to.has.property('skip', 0);
    expect(data.meta).to.has.property('limit', 10);
    expect(data.meta).to.has.property('page', 1);
    expect(data.meta).to.has.property('npage', 1);
  });

  it('should replace a doc', async () => {
    const res = await chai
      .request(address)
      .put(`/${docId}`)
      .set(SCHEMA_HEADER, JSON.stringify(TEST_SCHEMA))
      .send({
        name: 'foo 2',
        title: 'the title',
        age: 5,
        dob: '2023/02/12',
        parent: { foo: 'c', bar: 'd' }
      });

    expect(res.body.id).to.be.eq(docId);
    expect(res.body).to.has.property('id');
    expect(res.body).to.has.property('name', 'foo 2');
    expect(res.body).to.has.property('title', 'the title');
    expect(res.body).to.has.property('age', 5);
    expect(res.body).to.has.property('createdAt');
    expect(res.body).to.has.property('updatedAt');
    expect(res.body).to.has.property('version', 0);
    expect(res).to.has.property('status', 200);
  });

  it('should update a doc', async () => {
    const res = await chai
      .request(address)
      .patch(`/${docId}`)
      .set(SCHEMA_HEADER, JSON.stringify(TEST_SCHEMA))
      .send({
        set: {
          age: 4,
          'parent.foo': 'abc',
          schemas: [{ some: 'property', has: 'value' }]
        },
        inc: { 'parent.count': 1 },
        unset: { title: true }
      });

    const doc = res.body;

    expect(doc).not.to.has.property('_id');
    expect(doc).to.has.property('id');
    expect(doc).to.has.property('name', 'foo 2');
    expect(doc).to.has.property('age', 4);
    expect(doc).to.not.has.property('title');
    expect(doc.parent).to.has.property('foo', 'abc');
    expect(doc.parent).to.has.property('bar', 'd');
    expect(doc.parent).to.has.property('count', 1);
    expect(doc.createdAt).to.not.be.eq(doc.updatedAt);
    expect(doc).to.has.property('version', 1);

    expect(res).to.has.property('status', 200);
  });

  it('should remove a doc', async () => {
    const res = await chai
      .request(address)
      .delete(`/${docId}`)
      .set(SCHEMA_HEADER, JSON.stringify(TEST_SCHEMA));

    const doc = res.body;

    expect(doc).not.to.has.property('_id');
    expect(doc).to.has.property('id');
    expect(doc).to.has.property('name', 'foo 2');
    expect(doc).to.has.property('age', 4);
    expect(doc).to.not.has.property('title');
    expect(doc.parent).to.has.property('foo', 'abc');
    expect(doc.parent).to.has.property('bar', 'd');
    expect(doc.parent).to.has.property('count', 1);
    expect(doc.createdAt).to.not.be.eq(doc.updatedAt);
    expect(doc).to.has.property('version', 1);

    const res2 = await chai
      .request(address)
      .get(`/${docId}`)
      .set(SCHEMA_HEADER, JSON.stringify(TEST_SCHEMA));

    expect(res2.body.data).to.has.property('length', 0);
  });
});
