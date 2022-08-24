import { compare, Operation, unescapePathComponent } from 'fast-json-patch'
import { parse, ParsedNode, parseDocument, Scalar } from 'yaml'
import { Pair, YAMLMap, YAMLSeq } from 'yaml'

export type {
	AddOperation,
	BaseOperation,
	CopyOperation,
	GetOperation,
	MoveOperation,
	RemoveOperation,
	ReplaceOperation,
	TestOperation,
	Operation,
} from 'fast-json-patch'

import {
	NodeType,
	isYamlMap,
	isYamlSeq,
	toAstValue,
	cloneNode,
	parseSafeIndex,
} from './helpers'

type YAMLCollection = YAMLMap | YAMLSeq;

interface ParsedPath
{
	segments: Array< string >;
	last: string;
	parent: YAMLCollection;
	pathTo: ( index: number ) => string;
}

function traverse( root: ParsedNode, op: string, path: string ): ParsedPath
{
	const segments = path.split( '/' ).slice( 1 );
	if ( segments.length === 0 )
		throw new Error( `Invalid patch path: ${path}` );

	const pathTo = ( index: number ) =>
		'/' +
		segments.slice( 0, index === -1 ? undefined : index ).join( '/' );

	const last = unescapePathComponent( segments.pop( )! );

	let parent = root as YAMLCollection;

	segments.forEach( ( segment, index ) =>
	{
		if ( isYamlSeq( parent ) )
			parent = parent.get( parseInt( segment ), true ) as
				unknown as YAMLCollection;
		else
			parent = parent.get( segment, true ) as
				unknown as YAMLCollection;

		if ( !isYamlMap( parent ) && !isYamlSeq( parent ) )
		{
			throw new Error(
				`Can't ${op} node at path ${path}. ` +
				`${pathTo(index)} is ${( parent as any )?.type}.`
			);
		}
	} );

	return { segments, last, parent: parent, pathTo };
}

function applySinglePatch( root: ParsedNode, operation: Operation )
{
	const { last, parent, pathTo } =
		traverse( root, operation.op, operation.path );

	if ( operation.op === 'add' )
	{
		if ( isYamlMap( parent ) )
		{
			// Object
			parent.delete( last );
			parent.add( new Pair( last, toAstValue( operation.value ) ) );
		}
		else
		{
			// Array
			const index = parseSafeIndex( last, parent.items.length );
			if ( index === parent.items.length )
				parent.add( toAstValue( operation.value ) );
			else if ( isNaN( index ) )
				throw RangeError(
					`Can't ${operation.op} index ${last} ` +
					`to array at ${pathTo( -1 )}`
				);
			else
				parent.items[ index ] = toAstValue( operation.value );
		}
	}
	else if ( operation.op === 'replace' )
	{
		if ( isYamlMap( parent ) )
		{
			// Object
			if ( !parent.has( last ) )
				throw new ReferenceError(
					`Can't ${operation.op} ${operation.path} ` +
					`since it doesn't already exist`
				);
			parent.set( last, toAstValue( operation.value ) );
		}
		else
		{
			// Array
			const index = parseSafeIndex( last, parent.items.length - 1 );
			if ( isNaN( index ) )
				throw RangeError(
					`Can't ${operation.op} index ${last} ` +
					`to array at ${pathTo( -1 )}`
				);
			parent.items[ index ] = toAstValue( operation.value );
		}
	}
	else if ( operation.op === 'remove' )
	{
		if ( isYamlMap( parent ) )
		{
			// Object
			parent.delete( last );
		}
		else
		{
			// Array
			const index = parseSafeIndex( last, parent.items.length - 1 );
			if ( isNaN( index ) )
				throw RangeError(
					`Can't ${operation.op} index ${last} ` +
					`to array at ${pathTo( -1 )}`
				);
			parent.items.splice( index, 1 );
		}
	}
	else if ( operation.op === 'move' || operation.op === 'copy' )
	{
		const { last: lastFrom, parent: parentFrom, pathTo: pathToFrom } =
			traverse( root, operation.op, operation.from );

		type SourceType = { node: NodeType; commentBefore?: string | null };
		const sourceNode = ( ( ): SourceType =>
		{
			if ( isYamlMap( parentFrom ) )
			{
				// Object
				const node =
					parentFrom.get( lastFrom, true ) as NodeType ?? null;
				if ( lastFrom === undefined || node === null )
					throw ReferenceError(
						`Can't ${operation.op} key ${last} to object at ` +
						pathToFrom( -1 )
					);

				const indexOfChild =
					parentFrom.items.findIndex( item => item.value === node );
				let { commentBefore } =
					parentFrom.items[ indexOfChild ].key as Scalar ?? { };

				if ( operation.op === 'move' )
					parentFrom.delete( lastFrom );

				if ( indexOfChild === 0 )
				{
					// Copy (or move) commentBefore from parent object,
					// since this is the first property and the comment is on
					// the parent object in the CST.
					commentBefore =
						commentBefore == null
						? parentFrom.commentBefore
						: parentFrom.commentBefore + '\n' + commentBefore;

					if ( operation.op === 'move' )
						parentFrom.commentBefore = null;
				}

				return { node, commentBefore };
			}
			else if ( isYamlSeq( parentFrom ) )
			{
				// Array
				const index =
					parseSafeIndex( lastFrom, parentFrom.items.length - 1 );
				if ( isNaN( index ) )
					throw RangeError(
						`Can't ${operation.op} index ${lastFrom} ` +
						`to array at ${pathToFrom( -1 )}`
					);

				const node = parentFrom.get( index, true ) as NodeType ?? null;
				if ( operation.op === 'move' )
					parentFrom.delete( index );
				return { node };
			}
			else
				throw new ReferenceError(
					`Invalid type at ${operation.from}`
				);
		} )( );

		const { node, commentBefore } =
			operation.op === 'move'
			? sourceNode
			: { node: cloneNode( sourceNode.node ) } as SourceType;

		if ( isYamlMap( parent ) )
		{
			// Object
			parent.delete( last );

			// Add item with custom pair where the key is a scalar, hence can
			// have a commentBefore
			const lastScalar = new Scalar( last );
			lastScalar.commentBefore = commentBefore;
			const pair = new Pair( lastScalar, node );
			parent.add( pair );
		}
		else
		{
			// Array
			const index = parseSafeIndex( last, parent.items.length );
			if ( isNaN( index ) )
				throw RangeError(
					`Can't ${operation.op} index ${last} to array at ` +
					pathTo( -1 )
				);
			else if ( index === parent.items.length )
				parent.add( node );
			else
				parent.items[ index ] = node;
		}
	}
	else if ( operation.op === 'test' )
	{
		if (
			JSON.stringify( parent.toJSON( ) ) !==
			JSON.stringify( operation.value )
		)
			throw TypeError( `Patch test failed at ${operation.path}` );
	}
	else
	{
		throw new Error(
			`Operation ${( operation as any ).op} not supported`
		);
	}
}

export function yamlPatch( yaml: string, rfc6902: Array< Operation > ): string
{
	const doc = parseDocument( yaml, {
		keepSourceTokens: true,
		strict: false,
		prettyErrors: true,
	} );

	// An empty yaml doc produces a null document. Replace with an empty map.
	if ( !doc.contents )
	{
		const root = new YAMLMap( ) as YAMLMap.Parsed;
		root.range = [ 0, 0, 0 ];
		doc.contents = root;
		doc.contents.flow = false;
	}

	rfc6902.forEach( ( operation, index ) =>
	{
		try
		{
			applySinglePatch( doc.contents!, operation );
		}
		catch ( err: any )
		{
			const newErr = new err.constructor(
				`Patch #${index + 1} failed: ${err.message}`
			);
			newErr.stack = err.stack;
			throw newErr;
		}
	} );

	return doc.toString( );
}

export function yamlDiffPatch( yaml: string, oldJson: any, newJson: any )
: string
{
	return yamlPatch( yaml, compare( oldJson, newJson ) );
}

export function yamlOverwrite( yaml: string, newJson: any ): string
{
	const old = parse( yaml );
	return yamlDiffPatch( yaml, old, newJson );
}
