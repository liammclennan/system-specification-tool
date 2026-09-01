const config = {
    reporters: [
    'default',
        ['jest-junit', {outputDirectory: 'test/reports', outputName: 'report.xml'}],
    ],
  };
  
  module.exports = config;