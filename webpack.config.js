module.exports = {
    context: __dirname + "/src",
    entry: "./modash/index.js",
    module: {
        loaders: [
            { test: /\.js$/, exclude: /node_modules/, loader: "babel-loader" }
        ]
    },
    output: {
        path: __dirname + "/dist",
        filename: "modash.js"
    }
}
