'use strict';

import { Octokit } from 'octokit';
import { simpleGit } from 'simple-git';
import tar from 'tar'
import fs from 'fs';
import AWS from 'aws-sdk';
import rmfr from 'rmfr';

export const backup = async (event, context, callback) => {
    const directory = `/tmp/${Date.now()}`;

    try {
        const octokit = new Octokit({
            auth: process.env.GH_TOKEN
        });

        const res = await octokit.request('GET /orgs/{org}/repos{?type,sort,direction,per_page,page}', {
            org: process.env.GH_ORGANIZATION,
            type: process.env.GH_VISIBILITY
        });

        fs.mkdirSync(`/${directory}/repositories`, { recursive: true });

        await Promise.all(res.data.map((item) => simpleGit().clone(
            `https://${process.env.GH_TOKEN}@github.com/${item.full_name}`,
            `/${directory}/repositories/${item.name}`,
            ['--bare']
        )));

        const filename = [
            (new Date()).toISOString().slice(0, 10),
            Date.now()
        ].join('-') + '.tgz';

        await tar.create(
            {gzip: true, file: `/${directory}/${filename}`},
            [`/${directory}/repositories`]
        );

        const S3 = new AWS.S3({ region: process.env.REGION });

        await S3.upload({
            Bucket: process.env.BUCKET,
            Body: fs.createReadStream(`/${directory}/${filename}`),
            Key: filename
        }).promise();

        if (process.env.SUCCESS_PING_URL !== undefined && process.env.SUCCESS_PING_URL.trim().length > 0) {
            await fetch(process.env.SUCCESS_PING_URL);
        }
    } finally {
        await rmfr(directory);
    }
};