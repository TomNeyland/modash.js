import { size } from 'lodash-es';

function count(collection) {
  return size(collection);
}

export { count };
export default { count };
