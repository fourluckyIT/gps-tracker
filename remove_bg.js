const Jimp = require('jimp');

async function removeBlackBackground(imagePath, outputPath) {
    try {
        const image = await Jimp.read(imagePath);

        image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
            // Get RGBA values
            const red = this.bitmap.data[idx + 0];
            const green = this.bitmap.data[idx + 1];
            const blue = this.bitmap.data[idx + 2];

            // If the pixel is close to black (threshold < 30)
            if (red < 30 && green < 30 && blue < 30) {
                // Set alpha to 0 (transparent)
                this.bitmap.data[idx + 3] = 0;
            }
        });

        await image.writeAsync(outputPath);
        console.log("Image processed successfully!");
    } catch (err) {
        console.error("Error processing image:", err);
    }
}

removeBlackBackground('public/logo.png', 'public/logo.png');
