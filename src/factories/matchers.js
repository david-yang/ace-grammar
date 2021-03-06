    
    //
    // matcher factories
    var 
        SimpleMatcher = Class({
            
            constructor : function(type, name, pattern, key) {
                var ayto = this;
                ayto.type = T_SIMPLEMATCHER;
                ayto.tt = type || T_CHAR;
                ayto.tn = name;
                ayto.tk = key || 0;
                ayto.tg = 0;
                ayto.tp = null;
                ayto.p = null;
                ayto.np = null;
                
                // get a fast customized matcher for < pattern >
                switch ( ayto.tt )
                {
                    case T_CHAR: case T_CHARLIST:
                        ayto.tp = pattern;
                        break;
                    case T_STR:
                        ayto.tp = pattern;
                        ayto.p = {};
                        ayto.p[ '' + pattern.charAt(0) ] = 1;
                        break;
                    case T_REGEX:
                        ayto.tp = pattern[ 0 ];
                        ayto.p = pattern[ 1 ].peek || null;
                        ayto.np = pattern[ 1 ].negativepeek || null;
                        ayto.tg = pattern[ 2 ] || 0;
                        break;
                    case T_NULL:
                        ayto.tp = null;
                        break;
                }
            },
            
            // matcher type
            type: null,
            // token type
            tt: null,
            // token name
            tn: null,
            // token pattern
            tp: null,
            // token pattern group
            tg: 0,
            // token key
            tk: 0,
            // pattern peek chars
            p: null,
            // pattern negative peek chars
            np: null,
            
            get : function(stream, eat) {
                var matchedResult, ayto = this,
                    tokenType = ayto.tt, tokenKey = ayto.tk, 
                    tokenPattern = ayto.tp, tokenPatternGroup = ayto.tg,
                    startsWith = ayto.p, notStartsWith = ayto.np
                ;    
                // get a fast customized matcher for < pattern >
                switch ( tokenType )
                {
                    case T_CHAR:
                        if ( matchedResult = stream.chr(tokenPattern, eat) ) return [ tokenKey, matchedResult ];
                        break;
                    case T_CHARLIST:
                        if ( matchedResult = stream.chl(tokenPattern, eat) ) return [ tokenKey, matchedResult ];
                        break;
                    case T_STR:
                        if ( matchedResult = stream.str(tokenPattern, startsWith, eat) ) return [ tokenKey, matchedResult ];
                        break;
                    case T_REGEX:
                        if ( matchedResult = stream.rex(tokenPattern, startsWith, notStartsWith, tokenPatternGroup, eat) ) return [ tokenKey, matchedResult ];
                        break;
                    case T_NULL:
                        // matches end-of-line
                        (false !== eat) && stream.end(); // skipToEnd
                        return [ tokenKey, "" ];
                        break;
                }
                return false;
            },
            
            toString : function() {
                return ['[', 'Matcher: ', this.tn, ', Pattern: ', ((this.tp) ? this.tp.toString() : null), ']'].join('');
            }
        }),
        
        CompositeMatcher = Class(SimpleMatcher, {
            
            constructor : function(name, matchers, useOwnKey) {
                var ayto = this;
                ayto.type = T_COMPOSITEMATCHER;
                ayto.tn = name;
                ayto.ms = matchers;
                ayto.ownKey = (false!==useOwnKey);
            },
            
            // group of matchers
            ms : null,
            ownKey : true,
            
            get : function(stream, eat) {
                var i, m, matchers = this.ms, l = matchers.length, useOwnKey = this.ownKey;
                for (i=0; i<l; i++)
                {
                    // each one is a matcher in its own
                    m = matchers[i].get(stream, eat);
                    if ( m ) return ( useOwnKey ) ? [ i, m[1] ] : m;
                }
                return false;
            }
        }),
        
        BlockMatcher = Class(SimpleMatcher, {
            
            constructor : function(name, start, end) {
                var ayto = this;
                ayto.type = T_BLOCKMATCHER;
                ayto.tn = name;
                ayto.s = new CompositeMatcher(ayto.tn + '_Start', start, false);
                ayto.e = end;
            },
            
            // start block matcher
            s : null,
            // end block matcher
            e : null,
            
            get : function(stream, eat) {
                    
                var ayto = this, startMatcher = ayto.s, endMatchers = ayto.e, token;
                
                // matches start of block using startMatcher
                // and returns the associated endBlock matcher
                if ( token = startMatcher.get(stream, eat) )
                {
                    // use the token key to get the associated endMatcher
                    var endMatcher = endMatchers[ token[0] ], T = get_type( endMatcher ), T0 = startMatcher.ms[ token[0] ].tt;
                    
                    if ( T_REGEX == T0 )
                    {
                        // regex group number given, get the matched group pattern for the ending of this block
                        if ( T_NUM == T )
                        {
                            // the regex is wrapped in an additional group, 
                            // add 1 to the requested regex group transparently
                            endMatcher = new SimpleMatcher( T_STR, ayto.tn + '_End', token[1][ endMatcher+1 ] );
                        }
                        // string replacement pattern given, get the proper pattern for the ending of this block
                        else if ( T_STR == T )
                        {
                            // the regex is wrapped in an additional group, 
                            // add 1 to the requested regex group transparently
                            endMatcher = new SimpleMatcher( T_STR, ayto.tn + '_End', groupReplace(endMatcher, token[1]) );
                        }
                    }
                    return endMatcher;
                }
                
                return false;
            }
        }),
        
        getSimpleMatcher = function(name, pattern, key, cachedMatchers) {
            var T = get_type( pattern );
            
            if ( T_NUM == T ) return pattern;
            
            if ( !cachedMatchers[ name ] )
            {
                key = key || 0;
                var matcher;
                var is_char_list = 0;
                
                if ( pattern && pattern.isCharList )
                {
                    is_char_list = 1;
                    delete pattern.isCharList;
                }
                
                // get a fast customized matcher for < pattern >
                if ( T_NULL & T ) matcher = new SimpleMatcher(T_NULL, name, pattern, key);
                
                else if ( T_CHAR == T ) matcher = new SimpleMatcher(T_CHAR, name, pattern, key);
                
                else if ( T_STR & T ) matcher = (is_char_list) ? new SimpleMatcher(T_CHARLIST, name, pattern, key) : new SimpleMatcher(T_STR, name, pattern, key);
                
                else if ( /*T_REGEX*/T_ARRAY & T ) matcher = new SimpleMatcher(T_REGEX, name, pattern, key);
                
                // unknown
                else matcher = pattern;
                
                cachedMatchers[ name ] = matcher;
            }
            
            return cachedMatchers[ name ];
        },
        
        getCompositeMatcher = function(name, tokens, RegExpID, combined, cachedRegexes, cachedMatchers) {
            
            if ( !cachedMatchers[ name ] )
            {
                var tmp, i, l, l2, array_of_arrays = 0, has_regexs = 0, is_char_list = 1, T1, T2;
                var matcher;
                
                tmp = make_array( tokens );
                l = tmp.length;
                
                if ( 1 == l )
                {
                    matcher = getSimpleMatcher( name, getRegexp( tmp[0], RegExpID, cachedRegexes ), 0, cachedMatchers );
                }
                else if ( 1 < l /*combined*/ )
                {   
                    l2 = (l>>1) + 1;
                    // check if tokens can be combined in one regular expression
                    // if they do not contain sub-arrays or regular expressions
                    for (i=0; i<=l2; i++)
                    {
                        T1 = get_type( tmp[i] );
                        T2 = get_type( tmp[l-1-i] );
                        
                        if ( (T_CHAR != T1) || (T_CHAR != T2) ) 
                        {
                            is_char_list = 0;
                        }
                        
                        if ( (T_ARRAY & T1) || (T_ARRAY & T2) ) 
                        {
                            array_of_arrays = 1;
                            //break;
                        }
                        else if ( hasPrefix( tmp[i], RegExpID ) || hasPrefix( tmp[l-1-i], RegExpID ) )
                        {
                            has_regexs = 1;
                            //break;
                        }
                    }
                    
                    if ( is_char_list && ( !combined || !( T_STR & get_type(combined) ) ) )
                    {
                        tmp = tmp.slice().join('');
                        tmp.isCharList = 1;
                        matcher = getSimpleMatcher( name, tmp, 0, cachedMatchers );
                    }
                    else if ( combined && !(array_of_arrays || has_regexs) )
                    {   
                        matcher = getSimpleMatcher( name, getCombinedRegexp( tmp, combined ), 0, cachedMatchers );
                    }
                    else
                    {
                        for (i=0; i<l; i++)
                        {
                            if ( T_ARRAY & get_type( tmp[i] ) )
                                tmp[i] = getCompositeMatcher( name + '_' + i, tmp[i], RegExpID, combined, cachedRegexes, cachedMatchers );
                            else
                                tmp[i] = getSimpleMatcher( name + '_' + i, getRegexp( tmp[i], RegExpID, cachedRegexes ), i, cachedMatchers );
                        }
                        
                        matcher = (l > 1) ? new CompositeMatcher( name, tmp ) : tmp[0];
                    }
                }
                
                cachedMatchers[ name ] = matcher;
            }
            
            return cachedMatchers[ name ];
        },
        
        getBlockMatcher = function(name, tokens, RegExpID, cachedRegexes, cachedMatchers) {
            
            if ( !cachedMatchers[ name ] )
            {
                var tmp, i, l, start, end, t1, t2;
                
                // build start/end mappings
                start = []; end = [];
                tmp = make_array_2( tokens ); // array of arrays
                for (i=0, l=tmp.length; i<l; i++)
                {
                    t1 = getSimpleMatcher( name + '_0_' + i, getRegexp( tmp[i][0], RegExpID, cachedRegexes ), i, cachedMatchers );
                    if (tmp[i].length>1)
                    {
                        if ( T_REGEX == t1.tt && T_STR == get_type( tmp[i][1] ) && !hasPrefix( tmp[i][1], RegExpID ) )
                            t2 = tmp[i][1];
                        else
                            t2 = getSimpleMatcher( name + '_1_' + i, getRegexp( tmp[i][1], RegExpID, cachedRegexes ), i, cachedMatchers );
                    }
                    else
                    {
                        t2 = t1;
                    }
                    start.push( t1 );  end.push( t2 );
                }
                
                cachedMatchers[ name ] = new BlockMatcher(name, start, end);
            }
            
            return cachedMatchers[ name ];
        }
    ;
