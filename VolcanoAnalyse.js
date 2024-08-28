// Gerekli veri setlerini içe aktar
var dataset = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');
var Etna = dataset.filter(ee.Filter.eq('country_na', 'Italy'));

// // Etna yanardağının geometrisini tanımla
// var geometry = ee.Geometry.Polygon([
//   [14.954337884164119, 37.77517551440563],
//   [14.962574626080283, 37.707317023963796],
//   [15.049205217077258, 37.7240658718806],
//   [15.034331173637128, 37.78022209361745],
//   [14.954337884164119, 37.77517551440563]
// ]);

// Geometriyi basitleştir
var simplifiedGeometry = geometry.simplify(2000);
Map.centerObject(simplifiedGeometry, 12);

// Görselleştirme parametreleri
var band_viz_SO2 = {min: 0.0, max: 5.0, palette: ['black', 'blue', 'purple', 'cyan', 'green', 'yellow', 'red']};
var band_viz_LST = {min: 0, max: 1320, palette: ['blue', 'cyan', 'green', 'yellow', 'red']};

// Etna sınırlarını haritaya ekle
Map.addLayer(Etna, {}, 'Etna');

// Analiz için tarih aralığını tanımla
var startDate = '2018-01-01';
var endDate = '2024-08-27';

// MODIS LST verilerini içe aktar ve tarih ve geometriye göre filtrele
var modis = ee.ImageCollection('MODIS/006/MOD11A1')
  .filterDate(startDate, endDate)
  .filterBounds(simplifiedGeometry);

var modLSTday = modis.select('LST_Day_1km');

// LST verilerini Celsius'a çevir ve zaman özelliklerini kopyala
var modLSTc = modLSTday.map(function(img) {
  return img
    .multiply(0.02)
    .subtract(273.15)
    .copyProperties(img, ['system:time_start']);
});

// LST için zaman serisi grafiği
var ts1 = ui.Chart.image.series({
  imageCollection: modLSTc,
  region: simplifiedGeometry,
  reducer: ee.Reducer.mean(),
  scale: 1000,
  xProperty: 'system:time_start'
}).setOptions({
  title: 'LST (Gündüz Yüzey Sıcaklığı) Zaman Serisi (2019-2023)',
  vAxis: {title: 'LST (Celsius)'}
});

print(ts1);

// Ortalama sıcaklığı hesapla ve bölgeye kırp
var clippedLSTc = modLSTc.mean().clip(simplifiedGeometry);

// LST için görselleştirme parametrelerini ayarla
Map.addLayer(clippedLSTc, {
  min: -20,
  max: 50,
  palette: ['blue', 'cyan', 'green', 'yellow', 'red']
}, '2019 Yılından Beri Ortalama Sıcaklık');

// Sentinel-5P TROPOMI SO2 verilerini içe aktar
var tropomi = ee.ImageCollection('COPERNICUS/S5P/NRTI/L3_SO2')
  .select('SO2_column_number_density')
  .filterBounds(geometry)
  .filterDate(startDate, endDate);

// Günlük SO2 konsantrasyonunu hesapla
var dailySO2 = tropomi.map(function(image) {
  return image.set('date', image.date().format('YYYY-MM-dd'));
});

var dailySO2Collection = ee.ImageCollection(dailySO2);

// SO2 konsantrasyonu için zaman serisi grafiği
var so2Chart = ui.Chart.image.series({
  imageCollection: dailySO2Collection,
  region: geometry,
  reducer: ee.Reducer.mean(),
  scale: 5000,
  xProperty: 'date'
}).setOptions({
  title: 'Günlük SO2 Konsantrasyonu (2019-2023)',
  vAxis: {title: 'SO2 Konsantrasyonu (mol/m²)'},
  hAxis: {title: 'Tarih'}
});

print(so2Chart);

// Ortalama SO2 konsantrasyonunu haritaya ekle
Map.addLayer(dailySO2Collection.mean().clip(geometry), {
  min: 0.0,
  max: 0.0005,
  palette: ['black', 'blue', 'purple', 'cyan', 'green', 'yellow', 'red']
}, 'Ortalama SO2 Konsantrasyonu (2019-2023)');

// Sentinel-2 verilerini bulut örtüsüne göre filtrele (%5)
var sentinel = ee.ImageCollection('COPERNICUS/S2')
  .filter(ee.Filter.date(startDate, endDate))
  .filterBounds(geometry)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 5));

// Bulut maskesi fonksiyonunu güncelle
function maskClouds(image) {
  var qa = image.select('MSK_CLASSI_OPAQUE');
  var mask = qa.eq(0);
  return image.updateMask(mask);
}

// NDVI hesapla
var calculateNDVI = function(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  return image.addBands(ndvi);
};

// EVI hesapla
var calculateEVI = function(image) {
  var evi = image.expression(
    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
      'NIR': image.select('B8'),
      'RED': image.select('B4'),
      'BLUE': image.select('B2')
    }).rename('EVI');
  return image.addBands(evi);
};

// NBR hesapla
var calculateNBR = function(image) {
  var nbr = image.normalizedDifference(['B8', 'B12']).rename('NBR');
  return image.addBands(nbr);
};

// NDVI, EVI ve NBR hesaplamalarını veri kümesine uygula
var sentinelWithIndices = sentinel.map(calculateNDVI).map(calculateEVI).map(calculateNBR);

// NDVI için zaman serisi grafiği
var ndviChart = ui.Chart.image.series({
  imageCollection: sentinelWithIndices.select('NDVI'),
  region: geometry,
  reducer: ee.Reducer.mean(),
  scale: 10,
  xProperty: 'system:time_start'
}).setOptions({
  title: 'NDVI Zaman Serisi (2019-2023)',
  vAxis: {title: 'NDVI'},
  hAxis: {title: 'Tarih'}
});

print(ndviChart);

// MODIS AOD verilerini ekleyin ve filtreleyin
var aod = ee.ImageCollection('MODIS/006/MCD19A2_GRANULES')
  .select('Optical_Depth_047')
  .filterDate(startDate, endDate)
  .filterBounds(geometry);

// AOD verilerini ortalama hesaplayın ve kırpın
var avgAOD = aod.mean().clip(geometry);

// AOD için zaman serisi grafiği
var aodChart = ui.Chart.image.series({
  imageCollection: aod,
  region: geometry,
  reducer: ee.Reducer.mean(),
  scale: 1000,
  xProperty: 'system:time_start'
}).setOptions({
  title: 'Günlük Ortalama AOD (2019-2023)',
  vAxis: {title: 'AOD'},
  hAxis: {title: 'Tarih'}
});

print(aodChart);

// Haritaya AOD verilerini ekleyin
Map.addLayer(avgAOD, {
  min: 0.0,
  max: 1.0,
  palette: ['blue', 'green', 'yellow', 'red']
}, 'Ortalama AOD (2019-2023)');

// SO2 ve LST arasındaki korelasyon
var calculateCorrelation = function(collection1, band1, collection2, band2, name1, name2) {
  var joined = ee.Join.saveFirst('second').apply({
    primary: collection1,
    secondary: collection2,
    condition: ee.Filter.maxDifference({
      difference: 1 * 24 * 60 * 60 * 1000, // 1 gün (milisaniye cinsinden)
      leftField: 'system:time_start',
      rightField: 'system:time_start'
    })
  });

  var combined = ee.ImageCollection(joined).map(function(image) {
    var second = ee.Image(image.get('second'));
    return ee.Image.cat(image.select(band1), second.select(band2)).rename([band1, band2]);
  });

  var correlation = combined.reduce(ee.Reducer.pearsonsCorrelation());
  
  var n = combined.size();
  var r = correlation.select('correlation').reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geometry,
    scale: 1000,
    maxPixels: 1e9
  }).get('correlation');
  
  var t = ee.Number(r).multiply(ee.Number(n).subtract(2).sqrt())
    .divide(ee.Number(1).subtract(ee.Number(r).multiply(r)).sqrt());
  
  var pValue = ee.Number(t).abs().divide(ee.Number(n.subtract(2)).sqrt()).erf().multiply(2);
  
  print(name1 + ' ve ' + name2 + ' arasındaki korelasyon:', r);
  print(name1 + ' ve ' + name2 + ' arasındaki p-değeri:', pValue);
};

// SO2 ve LST korelasyonunu hesapla
calculateCorrelation(dailySO2Collection, 'SO2_column_number_density', modLSTc, 'LST_Day_1km', 'SO2', 'LST');

// SO2 ve AOD arasındaki korelasyonu hesapla
calculateCorrelation(dailySO2Collection, 'SO2_column_number_density', aod, 'Optical_Depth_047', 'SO2', 'AOD');

// Zaman serisi ayrıştırma fonksiyonu
var timeSeriesDecomposition = function(collection, band) {
  var ts = collection.select(band);
  
  // Zaman bilgisini ekleyin ve milisaniye cinsinden dönüştürün
  ts = ts.map(function(image) {
    return image.addBands(ee.Image.constant(image.date().millis()).rename('time').cast({'time': 'long'}))
      .copyProperties(image, ['system:time_start']);
  });
  
  // Trend hesaplama
  var trend = ts.select(['time', band]).reduce(ee.Reducer.linearFit());
  
  // Trend çıkarma
  var detrended = ts.map(function(image) {
    var trendValue = trend.select('offset')
      .add(trend.select('scale').multiply(image.select('time')));
    return image.select(band).subtract(trendValue)
      .copyProperties(image, ['system:time_start']);
  });
  
  return {
    original: ts.select(band),
    trend: trend,
    detrended: detrended
  };
};

// SO2 zaman serisi ayrıştırması
var so2Decomposition = timeSeriesDecomposition(dailySO2Collection, 'SO2_column_number_density');

// Ayrıştırılmış SO2 zaman serisi grafiği
var so2DecompositionChart = ui.Chart.image.series({
  imageCollection: so2Decomposition.detrended,
  region: geometry,
  reducer: ee.Reducer.mean(),
  scale: 5000,
  xProperty: 'system:time_start'
}).setOptions({
  title: 'Ayrıştırılmış SO2 Zaman Serisi',
  vAxis: {title: 'Ayrıştırılmış SO2 Konsantrasyonu'},
  hAxis: {title: 'Tarih'}
});

print(so2DecompositionChart);

// Mevsimsel analiz fonksiyonu
var seasonalAnalysis = function(collection, band) {
  var ts = collection.select(band);
  var years = ee.List.sequence(2019, 2023);
  var months = ee.List.sequence(1, 12);
  
  var monthlyMeans = years.map(function(year) {
    return months.map(function(month) {
      var filtered = ts.filter(ee.Filter.calendarRange(year, year, 'year'))
                       .filter(ee.Filter.calendarRange(month, month, 'month'));
      return filtered.mean().set('year', year).set('month', month);
    });
  }).flatten();
  
  return ee.ImageCollection(monthlyMeans);
};

// SO2 mevsimsel analizi
var so2Seasonal = seasonalAnalysis(dailySO2Collection, 'SO2_column_number_density');

// SO2 mevsimsel analiz grafiği
var so2SeasonalChart = ui.Chart.image.series({
  imageCollection: so2Seasonal,
  region: geometry,
  reducer: ee.Reducer.mean(),
  scale: 5000
}).setOptions({
  title: 'SO2 Mevsimsel Analiz',
  vAxis: {title: 'Ortalama SO2 Konsantrasyonu'},
  hAxis: {title: 'Ay'}
});

print(so2SeasonalChart);

// Çoklu değişken analizi fonksiyonu
var multiVariateAnalysis = function(collection1, band1, collection2, band2, collection3, band3) {
  var joined = ee.Join.saveAll('matches').apply({
    primary: collection1,
    secondary: ee.ImageCollection(collection2.merge(collection3)),
    condition: ee.Filter.maxDifference({
      difference: 1 * 24 * 60 * 60 * 1000,
      leftField: 'system:time_start',
      rightField: 'system:time_start'
    })
  });
  
  return ee.ImageCollection(joined.map(function(image) {
    var matches = ee.List(image.get('matches'));
    var band2Image = ee.Image(matches.get(0)).select(band2);
    var band3Image = ee.Image(matches.get(1)).select(band3);
    return ee.Image.cat(image.select(band1), band2Image, band3Image)
      .set('system:time_start', image.get('system:time_start'));
  }));
};

// SO2, LST ve AOD çoklu değişken analizi
var multiVarCollection = multiVariateAnalysis(
  dailySO2Collection, 'SO2_column_number_density',
  modLSTc, 'LST_Day_1km',
  aod, 'Optical_Depth_047'
);

// Çoklu değişken analiz grafiği
var multiVarChart = ui.Chart.image.series({
  imageCollection: multiVarCollection,
  region: geometry,
  reducer: ee.Reducer.mean(),
  scale: 5000,
  xProperty: 'system:time_start'
}).setOptions({
  title: 'SO2, LST ve AOD Çoklu Değişken Analizi',
  vAxes: {
    0: {title: 'SO2 Konsantrasyonu'},
    1: {title: 'LST (°C)'},
    2: {title: 'AOD'}
  },
  series: {
    0: {targetAxisIndex: 0},
    1: {targetAxisIndex: 1},
    2: {targetAxisIndex: 2}
  }
});

print(multiVarChart);

// Mekânsal analiz fonksiyonu
var spatialAnalysis = function(image, scale) {
  var reducers = ee.Reducer.mean()
    .combine(ee.Reducer.stdDev(), '', true)
    .combine(ee.Reducer.minMax(), '', true);
  
  var stats = image.reduceRegion({
    reducer: reducers,
    geometry: geometry,
    scale: scale,
    maxPixels: 1e9
  });
  
  return stats;
};

// SO2 mekânsal analizi
var so2SpatialStats = spatialAnalysis(dailySO2Collection.mean(), 1000);
print('SO2 Mekânsal İstatistikler:', so2SpatialStats);

// LST mekânsal analizi
var lstSpatialStats = spatialAnalysis(modLSTc.mean(), 1000);
print('LST Mekânsal İstatistikler:', lstSpatialStats);

// Bitki sağlığı analizi için gelişmiş vejetasyon indeksi (EVI2) hesaplama
var calculateEVI2 = function(image) {
  var evi2 = image.expression(
    '2.5 * ((NIR - RED) / (NIR + 2.4 * RED + 1))', {
      'NIR': image.select('B8'),
      'RED': image.select('B4')
    }).rename('EVI2');
  return image.addBands(evi2).copyProperties(image, ['system:time_start']);
};

// Sentinel-2 verilerini %5 bulut örtüsüne göre filtrele ve EVI2 hesapla
var evi2Collection = sentinel
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 5))
  .map(maskClouds)
  .map(calculateEVI2);

// SO2 ve EVI2 korelasyonu için fonksiyon
var calculateSO2EVI2Correlation = function() {
  // Koleksiyonların boş olup olmadığını kontrol et
  var so2Size = dailySO2Collection.size();
  var evi2Size = evi2Collection.size();
  
  if (so2Size.getInfo() === 0 || evi2Size.getInfo() === 0) {
    print('SO2 veya EVI2 koleksiyonu boş.');
    return;
  }
  
  var joined = ee.Join.saveFirst('evi2').apply({
    primary: dailySO2Collection,
    secondary: evi2Collection,
    condition: ee.Filter.maxDifference({
      difference: 1 * 24 * 60 * 60 * 1000, // 1 gün (milisaniye cinsinden)
      leftField: 'system:time_start',
      rightField: 'system:time_start'
    })
  });

  var combined = ee.ImageCollection(joined).map(function(image) {
    var evi2Image = ee.Image(image.get('evi2'));
    return ee.Image.cat(image.select('SO2_column_number_density'), evi2Image.select('EVI2'))
      .rename(['SO2', 'EVI2'])
      .copyProperties(image, ['system:time_start']);
  });

  // Birleştirilmiş koleksiyonun boş olup olmadığını kontrol et
  var combinedSize = combined.size();
  if (combinedSize.getInfo() === 0) {
    print('SO2 ve EVI2 arasında eşleşen veri bulunamadı.');
    return;
  }

  var correlation = combined.reduce(ee.Reducer.pearsonsCorrelation());
  
  var n = combined.size();
  var r = correlation.select('correlation').reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geometry,
    scale: 1000,
    maxPixels: 1e9
  }).get('correlation');
  
  var t = ee.Number(r).multiply(ee.Number(n).subtract(2).sqrt())
    .divide(ee.Number(1).subtract(ee.Number(r).pow(2)).sqrt());
  
  var pValue = ee.Number(1).subtract(
    ee.Number(t).abs().divide(ee.Number(n.subtract(2)).sqrt()).erf()
  ).multiply(2);

  print('SO2 ve EVI2 arasındaki korelasyon:', r);
  print('SO2 ve EVI2 arasındaki p-değeri:', pValue);
  
  // Korelasyon grafiği
  var correlationChart = ui.Chart.image.series({
    imageCollection: combined,
    region: geometry,
    reducer: ee.Reducer.mean(),
    scale: 1000
  }).setOptions({
    title: 'SO2 ve EVI2 Korelasyonu',
    hAxis: {title: 'Tarih'},
    vAxis: {title: 'Değer'},
    series: {
      0: {targetAxisIndex: 0, label: 'SO2'},
      1: {targetAxisIndex: 1, label: 'EVI2'}
    },
    vAxes: {
      0: {title: 'SO2 Konsantrasyonu'},
      1: {title: 'EVI2'}
    }
  });
  
  print(correlationChart);
};

// Fonksiyonu çağır
calculateSO2EVI2Correlation();

// EVI2 zaman serisi grafiği
var evi2Chart = ui.Chart.image.series({
  imageCollection: evi2Collection.select('EVI2'),
  region: geometry,
  reducer: ee.Reducer.mean(),
  scale: 10,
  xProperty: 'system:time_start'
}).setOptions({
  title: 'EVI2 Zaman Serisi (2019-2023)',
  vAxis: {title: 'EVI2'},
  hAxis: {title: 'Tarih'}
});

print(evi2Chart);