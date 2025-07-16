This is a [Next.js](https://nextjs.org) app to control multiple OBS [Source Switchers](https://obsproject.com/forum/resources/source-switcher.941/)

## Configuration
The application uses a configurable directory for storing files and the database. To update the directory: create `.env.local` in the root of the project.

`.env.local` should look like:
```
FILE_DIRECTORY=C:\\OBS\\source-switching
```
If no `.env.local` file is created, it will default to `./files`, as seen in `config.js`


```javascript
  const config = {
    FILE_DIRECTORY: path.resolve('./files'),
  };
```

In the "Source Switcher" properties in OBS, at the bottom, is a setting called `Current Source File`. Enable that, point it to the location of one of the text files, and put the read interval to 1000ms. Your source will change whenever the text file changes to a source _that is defined in the Source Switcher properties_

The list of available sources is defined in a SQLite3 DB, location set in the `api/setActive.ts` route.

`npm install` and 
`npm run dev` to run it. 

This is my first [Next.js](https://nextjs.org) app and I am not a Javascript Developer professionally, use at your own risk.


