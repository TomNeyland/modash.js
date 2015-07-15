import aggregate from './aggregate';
import count from './count';
import distinct from './distinct';
import group from './group';
import mapReduce from './mapReduce';


/*
    Core Modash Object
 */

const Modash = {
    aggregate,
    count,
    distinct,
    group,
    mapReduce
};


// Export the module
export default Modash;
