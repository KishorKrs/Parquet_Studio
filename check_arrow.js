import * as arrow from 'apache-arrow';
console.log('Table keys:', Object.keys(arrow.Table));
console.log('Table.from type:', typeof arrow.Table.from);
console.log('Arrow exports:', Object.keys(arrow));
