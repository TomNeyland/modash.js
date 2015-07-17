import {aggregate} from './aggregation';
import {count} from './count';
// import distinct from './distinct';
// import group from './group';
// import mapReduce from './mapReduce';
import {$expression} from './expressions';


/*
    Core Modash Object
 */

const Modash = {
    aggregate,
    count,
    $expression
    // distinct,
    // group,
    // mapReduce
};


// Export the module
export default Modash;
