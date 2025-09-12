import { aggregate, $project, $group } from './aggregation.js';
import { count } from './count.js';
import { $expression } from './expressions.js';

/**
 * Modern MongoDB-inspired aggregation library for JavaScript.
 * 
 * Provides a clean, elegant API for processing JavaScript arrays using 
 * MongoDB aggregation pipeline syntax and operators.
 */
const Modash = {
    aggregate,
    count,
    $expression,
    $group,
    $project
};

export default Modash;
export { aggregate, count, $expression, $group, $project };
