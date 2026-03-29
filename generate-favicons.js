const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'public', 'favicon.svg');
const publicDir = path.join(__dirname, 'public');

async function generateFavicons() {
  console.log('Generando favicons...');

  // Leer SVG
  const svgBuffer = fs.readFileSync(svgPath);
  
  // Generar diferentes tamaños de PNG
  const sizes = [16, 32, 48, 180, 192, 512];
  const pngPaths = {};
  
  for (const size of sizes) {
    const outputPath = path.join(publicDir, `favicon-${size}x${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    pngPaths[size] = outputPath;
    console.log(`✓ Creado: favicon-${size}x${size}.png`);
  }

  // Crear apple-touch-icon (180x180)
  const appleTouchPath = path.join(publicDir, 'apple-touch-icon.png');
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(appleTouchPath);
  console.log('✓ Creado: apple-touch-icon.png');

  // Crear favicon.png principal (48x48 para Google)
  const faviconPngPath = path.join(publicDir, 'favicon.png');
  await sharp(svgBuffer)
    .resize(48, 48)
    .png()
    .toFile(faviconPngPath);
  console.log('✓ Creado: favicon.png');

  // Crear ICO verdadero multi-resolución
  const icoPath = path.join(publicDir, 'favicon.ico');
  
  try {
    // Usar imagesToIco directamente (export named)
    const { imagesToIco } = require('png-to-ico');
    const icoBuffer = await imagesToIco([
      pngPaths[16],
      pngPaths[32],
      pngPaths[48]
    ]);
    fs.writeFileSync(icoPath, icoBuffer);
    console.log(`✓ Creado/actualizado: favicon.ico (multi-resolución 16x16, 32x32, 48x48)`);
  } catch (err) {
    console.error('Error creando ICO:', err.message);
    // Fallback: usar PNG de 48x48
    fs.copyFileSync(pngPaths[48], icoPath);
    console.log('⚠ Usando fallback: favicon-48x48.png como favicon.ico');
  }

  console.log('\n✅ Todos los favicons generados correctamente!');
  console.log('\nArchivos creados:');
  fs.readdirSync(publicDir)
    .filter(f => f.startsWith('favicon') || f.startsWith('apple'))
    .forEach(f => console.log(`  - ${f}`));
}

generateFavicons().catch(console.error);
