var fs = require('fs');

var Assets = {
    assets: {},

    init: function () {
        try {
            this.assets = JSON.parse(fs.readFileSync('data/assets.json'));
        } catch (e) {
            console.log('Error loading assets info, skipped');
            return;
        }
        console.log('Loaded assets info');
    },
    save: function () {
        fs.writeFileSync('data/assets.json', JSON.stringify(this.assets));
        console.log('Saved assets info');
    },

    has: function (id) {
        return this.assets.hasOwnProperty(id);
    },
    add: function (owner, path, description, type, size, hash, callback) {
        var id, filename, file1, file2, that = this;

        id = owner + '_' + hash;

        // prevent same-user duplicates
        if (this.has(id)) {
            fs.unlinkSync(path);
            callback(null);
            return;
        }

        filename = 'data/assets/' + id;
        switch (type) {
            case 'image/jpeg':
                filename += '.jpg';
                break;
            case 'image/png':
                filename += '.png';
                break;
            case 'image/gif':
                filename += '.gif';
                break;
            default:
                fs.unlink(path);
                callback(null);
                return;
        }

        this.assets[id] = {
            path: filename,
            desc: description,
            type: type,
            size: size,
            hash: hash,
            id: id,
            owner: owner
        };
        file1 = fs.createReadStream(path);
        file2 = fs.createWriteStream(filename);
        file1.pipe(file2);
        file1.on('end', function () {
            fs.unlinkSync(path);
            that.save();
            callback(id);
        });
    },
    delete: function (id, callback) {
        var asset, that = this;

        if (!this.has(id)) {
            throw new Error('No such asset: ' + id);
        }
        asset = this.get(id);
        fs.unlink(asset.path, function (err) {
            if (!err) {
                delete that.assets[id];
                that.save();
                callback(true);
            } else {
                callback(false);
            }
        });
    },
    get: function (id) {
        if (!this.has(id)) {
            return null;
        }
        return this.assets[id];
    },
    canDelete: function (assetID, nick) {
        var asset = this.get(assetID);

        return (asset.owner === nick || User.isModerator(nick));
    }
};

Assets.init();

module.exports = Assets;
