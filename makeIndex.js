//makeIndex.js 
const _ = require('highland');
const fs = require('fs');
const csv = require('csv-parser');
const elasticsearch = require('elasticsearch');
const indexName = 'demo_elastic_index';

const start = async () => {
  const client = new elasticsearch.Client({
    host: 'localhost:9200',
    // log: 'trace',
  });

  await client.ping(
    { requestTimeout: 3000 },
    (error) => error ? console.trace('elasticsearch cluster is down!') : console.log('Elastic search is running.')
  );

  try {
    await client.indices.create({ index: indexName });
    console.log('created index');
  } catch (e) {
    if (!(e.status === 400)) throw e

    console.log('index alread exists');
  }

  // process file
  let currentIndex = 0;

  const stream = _(
    fs.createReadStream('./planet-latest-100k_geonames.tsv').pipe(
      csv({ separator: '\t' })
    )
  )
    .map(data => ({
      ...data,
      alternative_names: data.alternative_names.split(','),
      lon_num: parseFloat(data.lon),
      lat_num: parseFloat(data.lat),
      place_rank_num: parseInt(data.place_rank, 10),
      importance_num: parseFloat(data.importance),
    }))
    .map(data => [{
      index: { _index: indexName, _type: 'place', _id: data.osm_id },
    },
      data,
    ])
    .batch(100)
    .each(
      async entries => {
        stream.pause();

        const body = entries.reduce((acc, val) => acc.concat(val), []);

        await client.bulk({ body });

        currentIndex += 100;

        console.log('Created index :', currentIndex, entries[0]);

        stream.resume();
      })
    .on('end', () => {
      console.log('done');
      process.exit();
    });
};

start();